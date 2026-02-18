import { prisma } from "@/lib/prisma";
import { getGroupId } from "@/lib/auth";
import { LeaderboardClient } from "./leaderboard-client";

export default async function LeaderboardPage() {
  const groupId = await getGroupId();

  const statements = await prisma.weekStatement.findMany({
    where: { week: { groupId, status: "CLOSED" } },
    include: {
      member: true,
      week: { select: { id: true, name: true, closedAt: true } },
    },
    orderBy: { week: { closedAt: "desc" } },
  });

  // Aggregate per-member
  const memberMap = new Map<
    string,
    {
      memberId: string;
      name: string;
      totalPL: number;
      totalFreePlay: number;
      weeksPlayed: number;
      wins: number;
      losses: number;
      bestWeek: number;
      worstWeek: number;
      avgScore: number;
      scores: number[];
    }
  >();

  // Also group by week to determine weekly winners
  const weekResults = new Map<string, { memberId: string; score: number }[]>();

  for (const s of statements) {
    if (!weekResults.has(s.weekId)) weekResults.set(s.weekId, []);
    weekResults.get(s.weekId)!.push({
      memberId: s.memberId,
      score: s.weeklyScoreUnits,
    });

    const existing = memberMap.get(s.memberId);
    if (existing) {
      existing.totalPL += s.cashProfitUnits;
      existing.totalFreePlay += s.freePlayEarnedUnits;
      existing.weeksPlayed += 1;
      existing.scores.push(s.weeklyScoreUnits);
      if (s.weeklyScoreUnits > existing.bestWeek)
        existing.bestWeek = s.weeklyScoreUnits;
      if (s.weeklyScoreUnits < existing.worstWeek)
        existing.worstWeek = s.weeklyScoreUnits;
    } else {
      memberMap.set(s.memberId, {
        memberId: s.memberId,
        name: s.member.name,
        totalPL: s.cashProfitUnits,
        totalFreePlay: s.freePlayEarnedUnits,
        weeksPlayed: 1,
        wins: 0,
        losses: 0,
        bestWeek: s.weeklyScoreUnits,
        worstWeek: s.weeklyScoreUnits,
        avgScore: 0,
        scores: [s.weeklyScoreUnits],
      });
    }
  }

  // Calculate W-L record (weekly wins = finished 1st that week, losses = finished last)
  for (const [, results] of weekResults) {
    if (results.length === 0) continue;
    const sorted = [...results].sort((a, b) => b.score - a.score);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const bestEntry = memberMap.get(best.memberId);
    if (bestEntry) bestEntry.wins += 1;
    const worstEntry = memberMap.get(worst.memberId);
    if (worstEntry && results.length > 1) worstEntry.losses += 1;
  }

  // Calculate averages
  for (const [, m] of memberMap) {
    m.avgScore =
      m.scores.length > 0
        ? Math.round(m.scores.reduce((a, b) => a + b, 0) / m.scores.length)
        : 0;
  }

  const leaderboard = [...memberMap.values()].sort(
    (a, b) => b.totalPL - a.totalPL
  );

  // Get week list for date filtering
  const weeks = await prisma.week.findMany({
    where: { groupId, status: "CLOSED" },
    orderBy: { closedAt: "desc" },
    select: { id: true, name: true, closedAt: true },
  });

  return (
    <LeaderboardClient
      leaderboard={leaderboard}
      weeks={weeks.map((w) => ({
        id: w.id,
        name: w.name,
        closedAt: w.closedAt?.toISOString() ?? "",
      }))}
      statements={statements.map((s) => ({
        memberId: s.memberId,
        memberName: s.member.name,
        weekId: s.weekId,
        cashProfitUnits: s.cashProfitUnits,
        freePlayEarnedUnits: s.freePlayEarnedUnits,
        weeklyScoreUnits: s.weeklyScoreUnits,
      }))}
    />
  );
}
