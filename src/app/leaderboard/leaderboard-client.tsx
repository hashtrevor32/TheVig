"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Trophy, Flame, Crown, ChevronRight } from "lucide-react";
import { computePickStats, type PickStats } from "@/lib/pick-stats";

type LeaderboardEntry = PickStats & {
  operatorId: string;
  operatorName: string;
};

type OperatorInfo = {
  id: string;
  name: string;
};

type SerializedPick = {
  operatorId: string;
  status: string;
  result: string | null;
  bestOdds: number;
  stakeAmount: number | null;
  settledAt: string | null;
  trackedAt: string;
};

type TimeFilter = "all" | "7d" | "30d";

function fmtMoney(amount: number): string {
  const prefix = amount >= 0 ? "+$" : "-$";
  return `${prefix}${Math.abs(amount).toLocaleString()}`;
}

export function LeaderboardClient({
  entries: allEntries,
  operators,
  picks,
}: {
  entries: LeaderboardEntry[];
  operators: OperatorInfo[];
  picks: SerializedPick[];
}) {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");

  const entries = useMemo(() => {
    if (timeFilter === "all") return allEntries;

    const now = Date.now();
    const cutoff =
      timeFilter === "7d" ? now - 7 * 86400000 : now - 30 * 86400000;

    const filtered = picks.filter(
      (p) => new Date(p.trackedAt).getTime() >= cutoff
    );

    const byOp = new Map<string, SerializedPick[]>();
    for (const p of filtered) {
      const arr = byOp.get(p.operatorId) ?? [];
      arr.push(p);
      byOp.set(p.operatorId, arr);
    }

    const result: LeaderboardEntry[] = [];
    for (const op of operators) {
      const opPicks = byOp.get(op.id);
      if (!opPicks || opPicks.length === 0) continue;
      const stats = computePickStats(opPicks);
      result.push({ operatorId: op.id, operatorName: op.name, ...stats });
    }

    return result.sort((a, b) => b.totalProfit - a.totalProfit);
  }, [timeFilter, allEntries, operators, picks]);

  const rankBadge = (i: number) => {
    if (i === 0)
      return "bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-md shadow-amber-400/30";
    if (i === 1)
      return "bg-gradient-to-br from-slate-300 to-slate-400 text-white shadow-sm";
    if (i === 2)
      return "bg-gradient-to-br from-orange-400 to-orange-500 text-white shadow-sm";
    return "bg-slate-100 text-slate-500";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Rankings
        </h2>
      </div>

      {/* Time filter */}
      <div className="flex items-center gap-1.5 bg-slate-900 rounded-xl p-1 w-fit">
        {(["all", "7d", "30d"] as TimeFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setTimeFilter(f)}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              timeFilter === f
                ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/20"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {f === "all"
              ? "All Time"
              : f === "7d"
                ? "7 Days"
                : "30 Days"}
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
          <Trophy size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">No tracked picks yet.</p>
          <p className="text-slate-400 text-sm mt-1">
            Track picks from The Board to appear on the rankings.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, i) => (
            <Link
              key={entry.operatorId}
              href={`/users/${entry.operatorId}`}
              className={`block bg-white rounded-2xl border shadow-sm p-4 hover:shadow-md transition-all ${
                i === 0
                  ? "border-amber-200 hover:border-amber-300"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Rank badge */}
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${rankBadge(i)}`}
                >
                  {i === 0 ? (
                    <Crown size={18} />
                  ) : (
                    i + 1
                  )}
                </div>

                {/* Name + record */}
                <div className="flex-1 min-w-0">
                  <p className="text-slate-900 font-bold truncate">
                    {entry.operatorName}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                    <span className="text-xs font-medium text-slate-500">
                      {entry.wins}W-{entry.losses}L
                      {entry.pushes > 0 && `-${entry.pushes}P`}
                    </span>
                    {entry.wins + entry.losses > 0 && (
                      <span className="text-xs text-slate-400">
                        {entry.winRate}%
                      </span>
                    )}
                    {entry.roi !== 0 && (
                      <span
                        className={`text-xs font-semibold ${
                          entry.roi > 0 ? "text-emerald-600" : "text-red-500"
                        }`}
                      >
                        {entry.roi > 0 ? "+" : ""}
                        {entry.roi}% ROI
                      </span>
                    )}
                    {entry.streak >= 3 && entry.streakType === "W" && (
                      <span className="flex items-center gap-0.5 text-xs font-bold text-orange-500">
                        <Flame size={12} />
                        {entry.streak}W
                      </span>
                    )}
                    {entry.pending > 0 && (
                      <span className="text-xs text-slate-400">
                        {entry.pending} live
                      </span>
                    )}
                  </div>
                </div>

                {/* P&L */}
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xl font-extrabold tabular-nums ${
                      entry.totalProfit > 0
                        ? "text-emerald-600"
                        : entry.totalProfit < 0
                          ? "text-red-500"
                          : "text-slate-400"
                    }`}
                  >
                    {fmtMoney(entry.totalProfit)}
                  </span>
                  <ChevronRight size={16} className="text-slate-300" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
