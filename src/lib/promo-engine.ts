import { prisma } from "./prisma";

export type LossRebateRule = {
  windowStart: string; // ISO datetime
  windowEnd: string;
  minHandleUnits: number; // minimum total stake to qualify
  percentBack: number; // percentage of losses rebated
  capUnits: number; // max rebate amount
  oddsMin?: number | null; // minimum American odds (e.g. -200)
  oddsMax?: number | null; // maximum American odds
  disqualifyBothSides: boolean; // DQ if member bet both sides of same event
  eventKeyPattern?: string | null; // filter: only bets whose eventKey or description contains this (case-insensitive). e.g. "golf", "nfl", "nba"
};

/** Check if a bet matches the promo's eventKeyPattern filter */
export function matchesEventPattern(
  eventKey: string | null,
  description: string,
  pattern: string | null | undefined
): boolean {
  if (!pattern) return true; // no filter = all bets count
  const p = pattern.toLowerCase();
  const ek = (eventKey || "").toLowerCase();
  const desc = description.toLowerCase();
  return ek.includes(p) || desc.includes(p);
}

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
      if (!matchesEventPattern(b.eventKey, b.description, rule.eventKeyPattern)) return false;
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
