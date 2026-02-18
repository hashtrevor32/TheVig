/**
 * Shared promo types and utilities.
 * This file is safe to import from both client and server components
 * (no server-only imports like prisma).
 */

export type LossRebateRule = {
  windowStart: string; // ISO datetime
  windowEnd: string;
  minHandleUnits: number; // minimum total stake to qualify
  percentBack: number; // percentage of losses rebated
  capUnits: number; // max rebate amount
  oddsMin?: number | null; // minimum American odds (e.g. -200)
  oddsMax?: number | null; // maximum American odds
  disqualifyBothSides: boolean; // DQ if member bet both sides of same event
  sport?: string | null; // filter: only bets with this sport (e.g. "golf", "nfl")
  betType?: string | null; // filter: only bets with this betType (e.g. "outright", "matchup")
  eventKeyPattern?: string | string[] | null; // LEGACY: keyword filter, kept for backward compat
};

export type ParsedPromo = {
  name: string;
  type: "LOSS_REBATE";
  ruleJson: {
    windowStart: string;
    windowEnd: string;
    minHandleUnits: number;
    percentBack: number;
    capUnits: number;
    oddsMin: number | null;
    oddsMax: number | null;
    disqualifyBothSides: boolean;
    sport: string | null;
    betType: string | null;
  };
};

/** Format a promo rule into a human-readable summary string. */
export function formatPromoRule(rule: ParsedPromo["ruleJson"]): string {
  const parts: string[] = [];
  parts.push(`${rule.percentBack}% back on losses`);
  const filter = [rule.sport, rule.betType].filter(Boolean).join(" ");
  if (filter) {
    parts.push(`${filter} bets only`);
  }
  if (rule.minHandleUnits > 0) {
    parts.push(`min ${rule.minHandleUnits} units bet`);
  }
  if (rule.capUnits < 9999) {
    parts.push(`cap ${rule.capUnits} units`);
  }
  if (rule.oddsMin != null) parts.push(`min odds ${rule.oddsMin}`);
  if (rule.oddsMax != null) parts.push(`max odds ${rule.oddsMax}`);
  return parts.join(" · ");
}
