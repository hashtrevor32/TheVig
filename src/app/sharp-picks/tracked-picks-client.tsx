"use client";

import { useState, useEffect, useRef } from "react";
import {
  Trophy,
  XCircle,
  Minus,
  Flame,
  Trash2,
  Sparkles,
  CheckCircle2,
  Loader2,
  DollarSign,
  Plus,
  X,
  MapPin,
  Zap,
  PenLine,
} from "lucide-react";

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

type Stats = {
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

const SPORTSBOOKS = ["FanDuel", "DraftKings", "Bet365", "BetMGM", "Caesars", "Hard Rock", "ESPN BET", "Fanatics"];
const US_STATES = [
  "AZ", "CO", "CT", "DC", "IL", "IN", "IA", "KS", "KY", "LA",
  "MA", "MD", "ME", "MI", "MS", "MT", "NC", "NH", "NJ", "NV",
  "NY", "OH", "OR", "PA", "RI", "TN", "VA", "VT", "WA", "WV", "WY",
];

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

// Compute profit for a single pick
function pickProfit(
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
  return 0; // PUSH or pending
}

type SourceTab = "all" | "smart" | "manual";

export function TrackedPicksClient({
  picks: initialPicks,
  stats: initialStats,
}: {
  picks: SerializedPick[];
  stats: Stats;
}) {
  const [picks, setPicks] = useState(initialPicks);
  const [stats, setStats] = useState(initialStats);
  const [sourceTab, setSourceTab] = useState<SourceTab>("all");
  const [filterStatus, setFilterStatus] = useState<
    "all" | "PENDING" | "SETTLED"
  >("all");
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [autoSettling, setAutoSettling] = useState(false);
  const [autoSettleResult, setAutoSettleResult] = useState<string | null>(null);
  const autoSettleRan = useRef(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addingBet, setAddingBet] = useState(false);

  // Auto-settle on page load (only once) — smart picks only (they have commenceTime)
  useEffect(() => {
    if (autoSettleRan.current) return;
    const cutoff = Date.now() - 4 * 60 * 60 * 1000;
    const overdue = picks.filter(
      (p) =>
        p.status === "PENDING" &&
        p.commenceTime &&
        new Date(p.commenceTime).getTime() < cutoff
    );
    if (overdue.length === 0) return;

    autoSettleRan.current = true;
    setAutoSettling(true);
    fetch("/api/tracked-picks/auto-settle", { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        if (data.settled > 0) {
          setAutoSettleResult(
            `Auto-settled ${data.settled} pick${data.settled > 1 ? "s" : ""}`
          );
          window.location.reload();
        } else {
          setAutoSettleResult(null);
        }
      })
      .catch(() => {
        setAutoSettleResult(null);
      })
      .finally(() => {
        setAutoSettling(false);
      });
  }, [picks]);

  // Filter picks by source tab then by status
  const sourceFiltered = picks.filter((p) => {
    if (p.status === "VOIDED") return false;
    if (sourceTab === "smart") return (p.source || "smart") === "smart";
    if (sourceTab === "manual") return p.source === "manual";
    return true;
  });

  const filtered = sourceFiltered.filter((p) => {
    if (filterStatus === "all") return true;
    return p.status === filterStatus;
  });

  // Group by date
  const grouped = filtered.reduce<Record<string, SerializedPick[]>>(
    (acc, pick) => {
      const date = fmtDate(pick.trackedAt);
      if (!acc[date]) acc[date] = [];
      acc[date].push(pick);
      return acc;
    },
    {}
  );

  // Recalculate stats from current picks + source filter
  function recalcStats(updatedPicks: SerializedPick[], source?: SourceTab): Stats {
    const src = source ?? sourceTab;
    const active = updatedPicks.filter((p) => {
      if (p.status === "VOIDED") return false;
      if (src === "smart") return (p.source || "smart") === "smart";
      if (src === "manual") return p.source === "manual";
      return true;
    });
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
      totalProfit += pickProfit(p.bestOdds, p.result, stake);
    }
    const roi = totalRisked > 0 ? (totalProfit / totalRisked) * 100 : 0;

    // Streak
    let streak = 0;
    let streakType: "W" | "L" | null = null;
    const byDate = [...settled].sort(
      (a, b) =>
        new Date(b.settledAt || 0).getTime() -
        new Date(a.settledAt || 0).getTime()
    );
    for (const p of byDate) {
      if (p.result === "PUSH") continue;
      const t = p.result === "WIN" ? "W" : "L";
      if (!streakType) {
        streakType = t;
        streak = 1;
      } else if (t === streakType) {
        streak++;
      } else break;
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

  // Recalc when source tab changes
  useEffect(() => {
    setStats(recalcStats(picks, sourceTab));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceTab]);

  async function handleSettle(
    pickId: string,
    result: "WIN" | "LOSS" | "PUSH"
  ) {
    setSettlingId(pickId);
    try {
      const res = await fetch(`/api/tracked-picks/${pickId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result }),
      });
      if (res.ok) {
        const updated = picks.map((p) =>
          p.id === pickId
            ? {
                ...p,
                status: "SETTLED",
                result,
                settledAt: new Date().toISOString(),
              }
            : p
        );
        setPicks(updated);
        setStats(recalcStats(updated));
      }
    } catch {
      // Handle error silently
    } finally {
      setSettlingId(null);
    }
  }

  async function handleUpdateStake(pickId: string, stakeAmount: number) {
    try {
      const res = await fetch(`/api/tracked-picks/${pickId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stakeAmount }),
      });
      if (res.ok) {
        const updated = picks.map((p) =>
          p.id === pickId ? { ...p, stakeAmount } : p
        );
        setPicks(updated);
        setStats(recalcStats(updated));
      }
    } catch {
      // Handle error silently
    }
  }

  async function handleDelete(pickId: string) {
    try {
      const res = await fetch(`/api/tracked-picks/${pickId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const updated = picks.filter((p) => p.id !== pickId);
        setPicks(updated);
        setStats(recalcStats(updated));
      }
    } catch {
      // Handle error silently
    }
  }

  async function handleAddManualBet(data: {
    pick: string;
    bestOdds: number;
    stakeAmount?: number;
    bestBookName: string;
    bookState: string;
  }) {
    setAddingBet(true);
    try {
      const res = await fetch("/api/tracked-picks/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        // Reload to get fresh data
        window.location.reload();
      }
    } catch {
      // Handle error silently
    } finally {
      setAddingBet(false);
    }
  }

  const hasData = stats.total > 0;
  const smartCount = picks.filter((p) => p.status !== "VOIDED" && (p.source || "smart") === "smart").length;
  const manualCount = picks.filter((p) => p.status !== "VOIDED" && p.source === "manual").length;

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4 pb-32">
      {/* Page header */}
      <div className="flex items-center gap-2 mb-5">
        <Sparkles size={20} className="text-indigo-500" />
        <h1 className="text-lg font-bold text-slate-900">Picks</h1>
        {stats.pending > 0 && (
          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full">
            {stats.pending} pending
          </span>
        )}
        {autoSettling && (
          <span className="flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-medium rounded-full">
            <Loader2 size={10} className="animate-spin" />
            Auto-settling...
          </span>
        )}
        {autoSettleResult && (
          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-medium rounded-full">
            {autoSettleResult}
          </span>
        )}
      </div>

      {/* Source tabs */}
      <div className="flex items-center gap-1.5 mb-5">
        {(
          [
            { key: "all" as SourceTab, label: "All", count: smartCount + manualCount },
            { key: "smart" as SourceTab, label: "Smart Picks", icon: Zap, count: smartCount },
            { key: "manual" as SourceTab, label: "My Bets", icon: PenLine, count: manualCount },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setSourceTab(t.key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl transition-all ${
              sourceTab === t.key
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-white text-slate-500 border border-slate-200 hover:text-slate-700"
            }`}
          >
            {"icon" in t && t.icon && <t.icon size={13} />}
            {t.label}
            {t.count > 0 && (
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  sourceTab === t.key
                    ? "bg-white/20 text-white"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}

        {/* Add bet button */}
        {(sourceTab === "manual" || sourceTab === "all") && (
          <button
            onClick={() => setShowAddForm(true)}
            className="ml-auto flex items-center gap-1 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl shadow-sm shadow-emerald-500/20 transition-colors"
          >
            <Plus size={14} />
            Add Bet
          </button>
        )}
      </div>

      {/* Add manual bet form */}
      {showAddForm && (
        <AddBetForm
          onSubmit={handleAddManualBet}
          onCancel={() => setShowAddForm(false)}
          submitting={addingBet}
        />
      )}

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

      {/* Status filters */}
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
      {!hasData && !showAddForm && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-3">
            <Sparkles size={24} className="text-indigo-400" />
          </div>
          <p className="text-slate-500 text-sm font-medium">
            No tracked picks yet
          </p>
          <p className="text-slate-400 text-xs mt-1.5 max-w-xs mx-auto">
            {sourceTab === "manual"
              ? "Tap \"+ Add Bet\" to start tracking your own bets."
              : sourceTab === "smart"
                ? "Go to The Board, open a game's Sharp Picks, and tap the bookmark icon to start tracking AI recommendations."
                : "Track Smart Picks from The Board or add your own bets manually."}
          </p>
          {sourceTab !== "smart" && (
            <button
              onClick={() => setShowAddForm(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl shadow-sm transition-colors"
            >
              <Plus size={14} />
              Add Your First Bet
            </button>
          )}
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
              <PickCard
                key={pick.id}
                pick={pick}
                settlingId={settlingId}
                onSettle={handleSettle}
                onUpdateStake={handleUpdateStake}
                onDelete={handleDelete}
                showSourceBadge={sourceTab === "all"}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Add bet form
function AddBetForm({
  onSubmit,
  onCancel,
  submitting,
}: {
  onSubmit: (data: {
    pick: string;
    bestOdds: number;
    stakeAmount?: number;
    bestBookName: string;
    bookState: string;
  }) => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const [pick, setPick] = useState("");
  const [oddsStr, setOddsStr] = useState("");
  const [stakeStr, setStakeStr] = useState("");
  const [book, setBook] = useState("");
  const [customBook, setCustomBook] = useState("");
  const [state, setState] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!pick.trim()) {
      setError("Enter a bet description");
      return;
    }

    const odds = parseInt(oddsStr);
    if (!oddsStr || isNaN(odds) || odds === 0 || (odds > -100 && odds < 100)) {
      setError("Enter valid American odds (e.g. +150 or -110)");
      return;
    }

    const selectedBook = book === "other" ? customBook : book;
    if (!selectedBook.trim()) {
      setError("Select a sportsbook");
      return;
    }

    if (!state) {
      setError("Select a state");
      return;
    }

    const stake = stakeStr ? parseInt(stakeStr) : undefined;

    onSubmit({
      pick: pick.trim(),
      bestOdds: odds,
      stakeAmount: stake && stake > 0 ? stake : undefined,
      bestBookName: selectedBook.trim(),
      bookState: state,
    });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
          <PenLine size={14} className="text-emerald-500" />
          Add a Bet
        </h3>
        <button
          onClick={onCancel}
          className="p-1 text-slate-400 hover:text-slate-600"
        >
          <X size={16} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Bet description */}
        <div>
          <label className="text-[11px] font-medium text-slate-500 mb-1 block">
            What&apos;s the bet?
          </label>
          <input
            type="text"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            placeholder="e.g. Scottie Scheffler to win Masters +800"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
            autoFocus
          />
        </div>

        {/* Odds + Stake row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-medium text-slate-500 mb-1 block">
              Odds
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={oddsStr}
              onChange={(e) => setOddsStr(e.target.value.replace(/[^0-9+-]/g, ""))}
              placeholder="+150 or -110"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent font-mono"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 mb-1 block">
              Stake (optional)
            </label>
            <div className="relative">
              <DollarSign
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="number"
                value={stakeStr}
                onChange={(e) => setStakeStr(e.target.value)}
                placeholder="100"
                className="w-full pl-7 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Sportsbook + State row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-medium text-slate-500 mb-1 block">
              Sportsbook
            </label>
            <select
              value={book}
              onChange={(e) => setBook(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent bg-white"
            >
              <option value="">Select...</option>
              {SPORTSBOOKS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
              <option value="other">Other</option>
            </select>
            {book === "other" && (
              <input
                type="text"
                value={customBook}
                onChange={(e) => setCustomBook(e.target.value)}
                placeholder="Enter sportsbook name"
                className="mt-1.5 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
              />
            )}
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 mb-1 block">
              State
            </label>
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent bg-white"
            >
              <option value="">Select...</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p className="text-red-500 text-xs font-medium">{error}</p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-xl shadow-sm shadow-emerald-500/20 transition-colors disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            Add Bet
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// Individual pick card component
function PickCard({
  pick,
  settlingId,
  onSettle,
  onUpdateStake,
  onDelete,
  showSourceBadge,
}: {
  pick: SerializedPick;
  settlingId: string | null;
  onSettle: (id: string, result: "WIN" | "LOSS" | "PUSH") => void;
  onUpdateStake: (id: string, stake: number) => void;
  onDelete: (id: string) => void;
  showSourceBadge?: boolean;
}) {
  const [editingStake, setEditingStake] = useState(false);
  const [stakeValue, setStakeValue] = useState(
    pick.stakeAmount?.toString() || ""
  );

  const isManual = pick.source === "manual";
  const stake = pick.stakeAmount || 100;
  const profit =
    pick.status === "SETTLED" && pick.result
      ? pickProfit(pick.bestOdds, pick.result, stake)
      : null;

  const potentialWin =
    pick.bestOdds > 0
      ? (stake * pick.bestOdds) / 100
      : (stake * 100) / Math.abs(pick.bestOdds);

  function handleStakeSubmit() {
    const amt = parseInt(stakeValue);
    if (amt > 0) {
      onUpdateStake(pick.id, amt);
    }
    setEditingStake(false);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      {/* Event info — different for smart vs manual */}
      <div className="flex items-center gap-2 mb-2">
        {showSourceBadge && (
          <span
            className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded-md ${
              isManual
                ? "bg-violet-100 text-violet-600"
                : "bg-indigo-100 text-indigo-600"
            }`}
          >
            {isManual ? "My Bet" : "Smart"}
          </span>
        )}
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
            {/* Result badge */}
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
        <p className="text-slate-500 text-xs leading-relaxed mb-3">
          {pick.reasoning}
        </p>
      )}

      {/* Stake + Actions */}
      {pick.status === "PENDING" && (
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
          {/* Stake input */}
          <div className="flex items-center gap-1 mr-1">
            <DollarSign size={11} className="text-slate-400" />
            {editingStake ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleStakeSubmit();
                }}
                className="flex items-center gap-1"
              >
                <input
                  type="number"
                  value={stakeValue}
                  onChange={(e) => setStakeValue(e.target.value)}
                  autoFocus
                  className="w-16 px-1.5 py-0.5 text-[11px] border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400 text-right"
                  onBlur={handleStakeSubmit}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setEditingStake(false);
                  }}
                />
              </form>
            ) : (
              <button
                onClick={() => {
                  setEditingStake(true);
                  setStakeValue(pick.stakeAmount?.toString() || "");
                }}
                className="text-[11px] text-slate-500 hover:text-indigo-600 font-medium border-b border-dashed border-slate-300"
              >
                {pick.stakeAmount ? `$${pick.stakeAmount}` : "Set stake"}
              </button>
            )}
          </div>

          <div className="w-px h-4 bg-slate-200" />

          {/* Settle buttons */}
          <span className="text-[10px] text-slate-400 font-medium">
            Settle:
          </span>
          <button
            onClick={() => onSettle(pick.id, "WIN")}
            disabled={settlingId === pick.id}
            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-bold rounded-lg border border-emerald-200 transition-colors"
          >
            <Trophy size={11} />
            Win
          </button>
          <button
            onClick={() => onSettle(pick.id, "LOSS")}
            disabled={settlingId === pick.id}
            className="flex items-center gap-1 px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 text-[11px] font-bold rounded-lg border border-red-200 transition-colors"
          >
            <XCircle size={11} />
            Loss
          </button>
          <button
            onClick={() => onSettle(pick.id, "PUSH")}
            disabled={settlingId === pick.id}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 text-[11px] font-bold rounded-lg border border-slate-200 transition-colors"
          >
            <Minus size={11} />
            Push
          </button>
          <div className="flex-1" />
          <button
            onClick={() => onDelete(pick.id)}
            className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
            title="Delete pick"
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}

      {/* Settled info */}
      {pick.status === "SETTLED" && (
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
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
