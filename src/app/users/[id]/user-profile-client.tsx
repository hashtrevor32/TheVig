"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Flame,
  Sparkles,
  CheckCircle2,
  MapPin,
} from "lucide-react";
import { computeProfit, type PickStats } from "@/lib/pick-stats";

type SerializedPick = {
  id: string;
  operatorId: string;
  groupId: string;
  source: string;
  eventId: string | null;
  sportKey: string | null;
  sportDisplay: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  commenceTime: string | null;
  category: string | null;
  market: string | null;
  marketLabel: string | null;
  pick: string;
  reasoning: string | null;
  confidence: string | null;
  bestBook: string | null;
  bestBookName: string | null;
  bestOdds: number;
  pinnacleOdds: number | null;
  evPercent: number | null;
  stakeAmount: number | null;
  bookState: string | null;
  status: string;
  result: string | null;
  settledAt: string | null;
  trackedAt: string;
  createdAt: string;
};

const confidenceStyles: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-700 border-emerald-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  speculative: "bg-violet-100 text-violet-700 border-violet-200",
};

const resultStyles: Record<string, string> = {
  WIN: "bg-emerald-100 text-emerald-700",
  LOSS: "bg-red-100 text-red-700",
  PUSH: "bg-slate-100 text-slate-500",
};

function fmtOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function UserProfileClient({
  operatorName,
  picks,
  stats,
  isOwn,
}: {
  operatorName: string;
  picks: SerializedPick[];
  stats: PickStats;
  isOwn: boolean;
}) {
  const [filterStatus, setFilterStatus] = useState<
    "all" | "PENDING" | "SETTLED"
  >("all");

  const filtered = picks.filter((p) => {
    if (filterStatus === "all") return true;
    return p.status === filterStatus;
  });

  const grouped = filtered.reduce<Record<string, SerializedPick[]>>(
    (acc, pick) => {
      const date = fmtDate(pick.trackedAt);
      if (!acc[date]) acc[date] = [];
      acc[date].push(pick);
      return acc;
    },
    {}
  );

  const hasData = stats.total > 0;

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4 pb-32">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/leaderboard"
          className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="flex items-center gap-2">
          <Sparkles size={20} className="text-indigo-500" />
          <h1 className="text-lg font-bold text-slate-900">
            {operatorName}&apos;s Picks
          </h1>
          {isOwn && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-600 text-[10px] font-bold rounded-full">
              You
            </span>
          )}
        </div>
      </div>

      {/* Stats bar */}
      {hasData && (
        <div className="grid grid-cols-4 gap-2 mb-5">
          <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-1">
              Record
            </p>
            <p className="text-sm font-bold text-slate-900">
              {stats.wins}-{stats.losses}
              {stats.pushes > 0 && `-${stats.pushes}`}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-1">
              Win Rate
            </p>
            <p
              className={`text-sm font-bold ${
                stats.winRate >= 55
                  ? "text-emerald-600"
                  : stats.winRate >= 50
                    ? "text-amber-600"
                    : stats.wins + stats.losses > 0
                      ? "text-red-600"
                      : "text-slate-400"
              }`}
            >
              {stats.wins + stats.losses > 0 ? `${stats.winRate}%` : "--"}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-1">
              P&L
            </p>
            <p
              className={`text-sm font-bold ${
                stats.totalProfit > 0
                  ? "text-emerald-600"
                  : stats.totalProfit < 0
                    ? "text-red-600"
                    : "text-slate-400"
              }`}
            >
              {stats.wins + stats.losses > 0
                ? `${stats.totalProfit > 0 ? "+" : ""}$${stats.totalProfit}`
                : "--"}
            </p>
            {stats.wins + stats.losses > 0 && (
              <p
                className={`text-[10px] font-medium ${
                  stats.roi > 0 ? "text-emerald-500" : "text-red-500"
                }`}
              >
                {stats.roi > 0 ? "+" : ""}
                {stats.roi}% ROI
              </p>
            )}
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-1">
              Streak
            </p>
            <p className="text-sm font-bold text-slate-900 flex items-center justify-center gap-1">
              {stats.streak > 0 ? (
                <>
                  {stats.streak}
                  {stats.streakType}
                  {stats.streakType === "W" && stats.streak >= 3 && (
                    <Flame size={14} className="text-orange-500" />
                  )}
                </>
              ) : (
                "--"
              )}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      {hasData && (
        <div className="flex gap-1.5 mb-5">
          {(
            [
              { key: "all", label: "All" },
              { key: "PENDING", label: "Pending" },
              { key: "SETTLED", label: "Settled" },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilterStatus(f.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                filterStatus === f.key
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white text-slate-500 border border-slate-200 hover:text-slate-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!hasData && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-3">
            <Sparkles size={24} className="text-indigo-400" />
          </div>
          <p className="text-slate-500 text-sm font-medium">
            No tracked picks yet
          </p>
        </div>
      )}

      {/* Picks grouped by date */}
      {Object.entries(grouped).map(([date, datePicks]) => (
        <div key={date} className="mb-6">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
            {date}
          </p>
          <div className="space-y-2.5">
            {datePicks.map((pick) => (
              <ReadOnlyPickCard key={pick.id} pick={pick} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReadOnlyPickCard({ pick }: { pick: SerializedPick }) {
  const isManual = pick.source === "manual";
  const stake = pick.stakeAmount || 100;
  const profit =
    pick.status === "SETTLED" && pick.result
      ? computeProfit(pick.bestOdds, pick.result, stake)
      : null;

  const potentialWin =
    pick.bestOdds > 0
      ? (stake * pick.bestOdds) / 100
      : (stake * 100) / Math.abs(pick.bestOdds);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      {/* Event info — different for smart vs manual */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded-md ${
            isManual
              ? "bg-violet-100 text-violet-600"
              : "bg-indigo-100 text-indigo-600"
          }`}
        >
          {isManual ? "My Bet" : "Smart"}
        </span>
        {isManual ? (
          <>
            {pick.bestBookName && (
              <span className="text-slate-400 text-[10px] font-medium">
                {pick.bestBookName}
              </span>
            )}
            {pick.bookState && (
              <>
                <span className="text-slate-300 text-[10px]">&middot;</span>
                <span className="text-slate-400 text-[10px] flex items-center gap-0.5">
                  <MapPin size={8} />
                  {pick.bookState}
                </span>
              </>
            )}
          </>
        ) : (
          <>
            {pick.sportDisplay && (
              <span className="text-slate-400 text-[10px] font-medium">
                {pick.sportDisplay}
              </span>
            )}
            {pick.awayTeam && pick.homeTeam && (
              <>
                <span className="text-slate-300 text-[10px]">&middot;</span>
                <span className="text-slate-400 text-[10px]">
                  {pick.awayTeam} @ {pick.homeTeam}
                </span>
              </>
            )}
            {pick.commenceTime && (
              <>
                <span className="text-slate-300 text-[10px]">&middot;</span>
                <span className="text-slate-400 text-[10px]">
                  {fmtTime(pick.commenceTime)}
                </span>
              </>
            )}
          </>
        )}
      </div>

      {/* Pick header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {!isManual && pick.confidence && (
              <span
                className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full border ${confidenceStyles[pick.confidence] || ""}`}
              >
                {pick.confidence}
              </span>
            )}
            {!isManual && pick.marketLabel && (
              <span className="text-slate-400 text-[10px] font-medium">
                {pick.marketLabel}
              </span>
            )}
            {pick.status === "SETTLED" && pick.result && (
              <span
                className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${resultStyles[pick.result] || ""}`}
              >
                {pick.result}
              </span>
            )}
            {pick.status === "PENDING" && (
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-amber-50 text-amber-600">
                PENDING
              </span>
            )}
          </div>
          <p className="text-slate-900 text-sm font-bold leading-snug">
            {pick.pick}
          </p>
        </div>

        {/* Odds + payout */}
        <div className="shrink-0 text-right">
          {!isManual && pick.bestBookName && (
            <span className="text-[9px] text-slate-400 block mb-0.5">
              {pick.bestBookName}
            </span>
          )}
          <span
            className={`font-mono text-xs font-bold ${
              pick.status === "SETTLED"
                ? pick.result === "WIN"
                  ? "text-emerald-600"
                  : pick.result === "LOSS"
                    ? "text-red-600"
                    : "text-slate-500"
                : "text-slate-700"
            }`}
          >
            {fmtOdds(pick.bestOdds)}
          </span>
          {pick.status === "SETTLED" && profit !== null && profit !== 0 && (
            <p
              className={`text-[10px] font-bold ${
                profit > 0 ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {profit > 0 ? "+" : ""}${Math.round(profit)}
            </p>
          )}
          {pick.status === "PENDING" && (
            <p className="text-[10px] text-slate-400">
              win +${Math.round(potentialWin)}
            </p>
          )}
        </div>
      </div>

      {/* Reasoning — smart picks only */}
      {!isManual && pick.reasoning && (
        <p className="text-slate-500 text-xs leading-relaxed">
          {pick.reasoning}
        </p>
      )}

      {/* Settled info */}
      {pick.status === "SETTLED" && (
        <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-100">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={11} className="text-slate-300" />
            <span className="text-[10px] text-slate-400">
              Settled {pick.settledAt ? fmtDate(pick.settledAt) : ""}
            </span>
          </div>
          {pick.stakeAmount && (
            <span className="text-[10px] text-slate-400">
              ${pick.stakeAmount} risked
            </span>
          )}
        </div>
      )}
    </div>
  );
}
