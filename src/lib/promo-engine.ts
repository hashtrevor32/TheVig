import { prisma } from "./prisma";

// Re-export shared types from client-safe module
export type { LossRebateRule, ParsedPromo } from "./promo-types";
export { formatPromoRule } from "./promo-types";

// Import for local use
import type { LossRebateRule } from "./promo-types";

/** Check if a bet matches the promo's sport/betType filters.
 *  Uses structured sport + betType fields on the bet, falling back to
 *  legacy eventKeyPattern matching against eventKey + description text.
 */
export function matchesPromoFilter(
  bet: { sport?: string | null; betType?: string | null; eventKey?: string | null; description: string },
  rule: { sport?: string | null; betType?: string | null; eventKeyPattern?: string | string[] | null }
): boolean {
  // If promo has structured sport/betType filters, use those
  if (rule.sport) {
    if (!bet.sport || bet.sport.toLowerCase() !== rule.sport.toLowerCase()) return false;
  }
  if (rule.betType) {
    if (!bet.betType || bet.betType.toLowerCase() !== rule.betType.toLowerCase()) return false;
  }

  // If promo has sport or betType set, those are sufficient — skip legacy pattern
  if (rule.sport || rule.betType) return true;

  // Legacy fallback: use eventKeyPattern for old promos
  if (rule.eventKeyPattern) {
    return matchesEventPattern(bet.eventKey ?? null, bet.description, rule.eventKeyPattern);
  }

  return true; // no filter = all bets count
}

/** Legacy: Check if a bet matches the promo's eventKeyPattern filter. */
export function matchesEventPattern(
  eventKey: string | null,
  description: string,
  pattern: string | string[] | null | undefined
): boolean {
  if (!pattern) return true;
  const combined = `${(eventKey || "")} ${description}`.toLowerCase();

  if (Array.isArray(pattern)) {
    if (pattern.length === 0) return true;
    return pattern.every((kw) => combined.includes(kw.toLowerCase()));
  }

  return combined.includes(pattern.toLowerCase());
}

// ── Promo Computation ──

export type PromoMemberResult = {
  memberId: string;
  memberName: string;
  eligibleBetsCount: number;
  eligibleHandleUnits: number;
  eligibleLosingStake: number;
  qualified: boolean;
  disqualified: boolean;
  disqualifyReason?: string;
  projectedAward: number;
  handleProgress: number; // percentage toward min handle
};

export async function computePromoResults(
  promoId: string
): Promise<PromoMemberResult[]> {
  const promo = await prisma.promo.findUnique({
    where: { id: promoId },
    include: {
      week: {
        include: {
          weekMembers: { include: { member: true } },
          bets: true,
        },
      },
    },
  });

  if (!promo || promo.type !== "LOSS_REBATE") return [];

  const rule = promo.ruleJson as unknown as LossRebateRule;
  const windowStart = new Date(rule.windowStart);
  const windowEnd = new Date(rule.windowEnd);

  return promo.week.weekMembers.map((wm) => {
    const memberBets = promo.week.bets.filter(
      (b) => b.memberId === wm.memberId
    );

    // Filter eligible bets
    const eligibleBets = memberBets.filter((b) => {
      const placed = new Date(b.placedAt);
      if (placed < windowStart || placed > windowEnd) return false;
      if (rule.oddsMin != null && b.oddsAmerican < rule.oddsMin) return false;
      if (rule.oddsMax != null && b.oddsAmerican > rule.oddsMax) return false;
      if (b.stakeCashUnits <= 0) return false;
      if (!matchesPromoFilter(b, rule)) return false;
      return true;
    });

    const eligibleHandleUnits = eligibleBets.reduce(
      (s, b) => s + b.stakeCashUnits,
      0
    );

    const eligibleLosingStake = eligibleBets
      .filter((b) => b.result === "LOSS")
      .reduce((s, b) => s + b.stakeCashUnits, 0);

    // Both-sides check
    let disqualified = false;
    let disqualifyReason: string | undefined;

    if (rule.disqualifyBothSides) {
      const eventGroups = new Map<string, number>();
      for (const b of eligibleBets) {
        if (b.eventKey) {
          eventGroups.set(b.eventKey, (eventGroups.get(b.eventKey) ?? 0) + 1);
        }
      }
      for (const [key, count] of eventGroups) {
        if (count >= 2) {
          disqualified = true;
          disqualifyReason = `Bet both sides: ${key}`;
          break;
        }
      }
    }

    const qualified =
      !disqualified &&
      eligibleHandleUnits >= rule.minHandleUnits &&
      eligibleLosingStake > 0;

    const projectedAward = qualified
      ? Math.min(
          rule.capUnits,
          Math.floor((eligibleLosingStake * rule.percentBack) / 100)
        )
      : 0;

    const handleProgress =
      rule.minHandleUnits > 0
        ? Math.min(100, (eligibleHandleUnits / rule.minHandleUnits) * 100)
        : 100;

    return {
      memberId: wm.memberId,
      memberName: wm.member.name,
      eligibleBetsCount: eligibleBets.length,
      eligibleHandleUnits,
      eligibleLosingStake,
      qualified,
      disqualified,
      disqualifyReason,
      projectedAward,
      handleProgress,
    };
  });
}

export async function generatePromoAwards(weekId: string) {
  const promos = await prisma.promo.findMany({
    where: { weekId, active: true },
  });

  for (const promo of promos) {
    if (promo.type !== "LOSS_REBATE") continue;

    const results = await computePromoResults(promo.id);

    for (const r of results) {
      if (r.qualified && r.projectedAward > 0) {
        // Check if award already exists for this promo+member
        const existing = await prisma.freePlayAward.findFirst({
          where: { weekId, memberId: r.memberId, promoId: promo.id },
        });

        if (!existing) {
          await prisma.freePlayAward.create({
            data: {
              weekId,
              memberId: r.memberId,
              source: "PROMO",
              amountUnits: r.projectedAward,
              promoId: promo.id,
              notes: `${promo.name}: ${r.eligibleLosingStake} losing units × ${(promo.ruleJson as unknown as LossRebateRule).percentBack}%`,
            },
          });
        }
      }
    }
  }
}
