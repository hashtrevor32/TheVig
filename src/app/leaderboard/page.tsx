import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computePickStats } from "@/lib/pick-stats";
import { LeaderboardClient } from "./leaderboard-client";

export default async function LeaderboardPage() {
  await requireSession();

  // Get all operators who have tracked at least one pick
  const operators = await prisma.operator.findMany({
    where: { trackedPicks: { some: {} } },
    select: { id: true, name: true },
  });

  // Get all non-voided tracked picks
  const allPicks = await prisma.trackedPick.findMany({
    where: { status: { not: "VOIDED" } },
    orderBy: { trackedAt: "desc" },
  });

  // Group picks by operator and compute stats
  const picksByOperator = new Map<
    string,
    typeof allPicks
  >();
  for (const pick of allPicks) {
    const arr = picksByOperator.get(pick.operatorId) ?? [];
    arr.push(pick);
    picksByOperator.set(pick.operatorId, arr);
  }

  const entries = operators.map((op) => {
    const picks = picksByOperator.get(op.id) ?? [];
    const stats = computePickStats(picks);
    return {
      operatorId: op.id,
      operatorName: op.name,
      ...stats,
    };
  });

  // Sort by P&L descending
  entries.sort((a, b) => b.totalProfit - a.totalProfit);

  // Serialize pick dates for time filtering on client
  const serializedPicks = allPicks.map((p) => ({
    operatorId: p.operatorId,
    status: p.status,
    result: p.result,
    bestOdds: p.bestOdds,
    stakeAmount: p.stakeAmount,
    settledAt: p.settledAt?.toISOString() ?? null,
    trackedAt: p.trackedAt.toISOString(),
  }));

  return (
    <LeaderboardClient
      entries={entries}
      operators={operators}
      picks={serializedPicks}
    />
  );
}
