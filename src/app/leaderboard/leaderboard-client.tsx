"use client";

import { useState, useMemo } from "react";

type LeaderboardEntry = {
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
};

type WeekInfo = {
  id: string;
  name: string;
  closedAt: string;
};

type StatementData = {
  memberId: string;
  memberName: string;
  weekId: string;
  cashProfitUnits: number;
  freePlayEarnedUnits: number;
  weeklyScoreUnits: number;
};

export function LeaderboardClient({
  leaderboard: allLeaderboard,
  weeks,
  statements,
}: {
  leaderboard: LeaderboardEntry[];
  weeks: WeekInfo[];
  statements: StatementData[];
}) {
  const [filter, setFilter] = useState<"all" | "range">("all");
  const [startWeek, setStartWeek] = useState(weeks[weeks.length - 1]?.id ?? "");
  const [endWeek, setEndWeek] = useState(weeks[0]?.id ?? "");

  const leaderboard = useMemo(() => {
    if (filter === "all" || weeks.length === 0) return allLeaderboard;

    // Get week IDs in the selected range
    const startIdx = weeks.findIndex((w) => w.id === startWeek);
    const endIdx = weeks.findIndex((w) => w.id === endWeek);
    const lo = Math.min(startIdx, endIdx);
    const hi = Math.max(startIdx, endIdx);
    const weekIds = new Set(weeks.slice(lo, hi + 1).map((w) => w.id));

    const filtered = statements.filter((s) => weekIds.has(s.weekId));

    // Re-aggregate
    const memberMap = new Map<
      string,
      LeaderboardEntry & { scores: number[] }
    >();

    // Group by week for W-L
    const weekResults = new Map<
      string,
      { memberId: string; score: number }[]
    >();

    for (const s of filtered) {
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
          name: s.memberName,
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

    for (const [, results] of weekResults) {
      if (results.length === 0) continue;
      const sorted = [...results].sort((a, b) => b.score - a.score);
      const bestEntry = memberMap.get(sorted[0].memberId);
      if (bestEntry) bestEntry.wins += 1;
      const worstEntry = memberMap.get(sorted[sorted.length - 1].memberId);
      if (worstEntry && results.length > 1) worstEntry.losses += 1;
    }

    for (const [, m] of memberMap) {
      m.avgScore =
        m.scores.length > 0
          ? Math.round(
              m.scores.reduce((a, b) => a + b, 0) / m.scores.length
            )
          : 0;
    }

    return [...memberMap.values()].sort((a, b) => b.totalPL - a.totalPL);
  }, [filter, startWeek, endWeek, allLeaderboard, statements, weeks]);

  if (weeks.length === 0) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Leaderboard</h2>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
          <p className="text-gray-500">No closed weeks yet.</p>
          <p className="text-gray-600 text-sm mt-1">
            Close a week to see lifetime standings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Leaderboard</h2>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            filter === "all"
              ? "bg-blue-600 text-white"
              : "bg-gray-800 text-gray-400 hover:text-white"
          }`}
        >
          All Time
        </button>
        <button
          onClick={() => setFilter("range")}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            filter === "range"
              ? "bg-blue-600 text-white"
              : "bg-gray-800 text-gray-400 hover:text-white"
          }`}
        >
          Date Range
        </button>
      </div>

      {filter === "range" && (
        <div className="flex items-center gap-2">
          <select
            value={startWeek}
            onChange={(e) => setStartWeek(e.target.value)}
            className="flex-1 px-2 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {weeks.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <span className="text-gray-500 text-xs">to</span>
          <select
            value={endWeek}
            onChange={(e) => setEndWeek(e.target.value)}
            className="flex-1 px-2 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {weeks.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Leaderboard Cards */}
      <div className="space-y-2">
        {leaderboard.map((entry, i) => (
          <div
            key={entry.memberId}
            className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex items-center gap-4"
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                i === 0
                  ? "bg-yellow-500/20 text-yellow-400"
                  : i === 1
                  ? "bg-gray-400/20 text-gray-300"
                  : i === 2
                  ? "bg-orange-500/20 text-orange-400"
                  : "bg-gray-800 text-gray-500"
              }`}
            >
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium">{entry.name}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                <span className="text-xs text-gray-500">
                  {entry.weeksPlayed}w
                </span>
                <span className="text-xs text-gray-500">
                  {entry.wins}W-{entry.losses}L
                </span>
                <span className="text-xs text-gray-500">
                  Avg {entry.avgScore >= 0 ? "+" : ""}
                  {entry.avgScore}
                </span>
                {entry.totalFreePlay > 0 && (
                  <span className="text-xs text-blue-400">
                    +{entry.totalFreePlay} FP
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-xs text-gray-600">
                  Best: {entry.bestWeek >= 0 ? "+" : ""}
                  {entry.bestWeek}
                </span>
                <span className="text-xs text-gray-600">
                  Worst: {entry.worstWeek >= 0 ? "+" : ""}
                  {entry.worstWeek}
                </span>
              </div>
            </div>
            <span
              className={`text-lg font-bold ${
                entry.totalPL > 0
                  ? "text-green-400"
                  : entry.totalPL < 0
                  ? "text-red-400"
                  : "text-gray-400"
              }`}
            >
              {entry.totalPL >= 0 ? "+" : ""}
              {entry.totalPL}
            </span>
          </div>
        ))}
      </div>

      {leaderboard.length === 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
          <p className="text-gray-500">No data for selected range.</p>
        </div>
      )}
    </div>
  );
}
