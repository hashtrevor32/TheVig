export type PickStats = {
  total: number;
  pending: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
  roi: number;
  totalProfit: number;
  streak: number;
  streakType: "W" | "L" | null;
};

export function computeProfit(
  odds: number,
  result: string | null,
  stake: number
): number {
  if (result === "WIN") {
    return odds > 0
      ? (stake * odds) / 100
      : (stake * 100) / Math.abs(odds);
  }
  if (result === "LOSS") return -stake;
  return 0; // PUSH
}

export function computePickStats(
  picks: Array<{
    status: string;
    result: string | null;
    bestOdds: number;
    stakeAmount: number | null;
    settledAt: Date | string | null;
  }>
): PickStats {
  const active = picks.filter((p) => p.status !== "VOIDED");
  const settled = active.filter((p) => p.status === "SETTLED");
  const wins = settled.filter((p) => p.result === "WIN");
  const losses = settled.filter((p) => p.result === "LOSS");
  const pushes = settled.filter((p) => p.result === "PUSH");
  const pending = active.filter((p) => p.status === "PENDING");

  const decisioned = wins.length + losses.length;
  const winRate = decisioned > 0 ? (wins.length / decisioned) * 100 : 0;

  let totalProfit = 0;
  let totalRisked = 0;
  for (const p of settled) {
    if (p.result === "PUSH") continue;
    const stake = p.stakeAmount || 100;
    totalRisked += stake;
    totalProfit += computeProfit(p.bestOdds, p.result, stake);
  }
  const roi = totalRisked > 0 ? (totalProfit / totalRisked) * 100 : 0;

  // Current streak
  let streak = 0;
  let streakType: "W" | "L" | null = null;
  const settledByDate = [...settled].sort((a, b) => {
    const aTime =
      a.settledAt instanceof Date
        ? a.settledAt.getTime()
        : new Date(a.settledAt ?? 0).getTime();
    const bTime =
      b.settledAt instanceof Date
        ? b.settledAt.getTime()
        : new Date(b.settledAt ?? 0).getTime();
    return bTime - aTime;
  });

  for (const p of settledByDate) {
    if (p.result === "PUSH") continue;
    if (!streakType) {
      streakType = p.result === "WIN" ? "W" : "L";
      streak = 1;
    } else if ((p.result === "WIN" ? "W" : "L") === streakType) {
      streak++;
    } else {
      break;
    }
  }

  return {
    total: active.length,
    pending: pending.length,
    wins: wins.length,
    losses: losses.length,
    pushes: pushes.length,
    winRate: Math.round(winRate * 10) / 10,
    roi: Math.round(roi * 10) / 10,
    totalProfit: Math.round(totalProfit),
    streak,
    streakType,
  };
}
