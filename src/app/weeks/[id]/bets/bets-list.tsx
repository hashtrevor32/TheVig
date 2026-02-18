"use client";

import { useState } from "react";
import { quickSettle, bulkSettle } from "@/lib/actions";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Zap, Check, X, SkipForward } from "lucide-react";

type AutoSettleSuggestion = {
  betId: string;
  result: "WIN" | "LOSS" | "PUSH" | "SKIP";
  reason: string;
  matchedGame: string | null;
};

type Bet = {
  id: string;
  memberId: string;
  member: { name: string };
  description: string;
  eventKey: string | null;
  oddsAmerican: number;
  stakeCashUnits: number;
  stakeFreePlayUnits: number;
  status: string;
  result: string | null;
  payoutCashUnits: number | null;
  placedAt: Date;
};

function calculateDefaultPayout(stake: number, odds: number): number {
  if (odds > 0) return stake + Math.round((stake * odds) / 100);
  return stake + Math.round((stake * 100) / Math.abs(odds));
}

export function BetsList({
  bets,
  weekId,
  weekStatus,
}: {
  bets: Bet[];
  weekId: string;
  weekStatus: string;
}) {
  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkWin, setBulkWin] = useState(false);
  const [winPayouts, setWinPayouts] = useState<Record<string, string>>({});
  const [settling, setSettling] = useState(false);
  const [autoSettling, setAutoSettling] = useState(false);
  const [autoSuggestions, setAutoSuggestions] = useState<AutoSettleSuggestion[]>([]);
  const [autoError, setAutoError] = useState("");
  const [gamesChecked, setGamesChecked] = useState(0);
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [applyingAuto, setApplyingAuto] = useState(false);
  const router = useRouter();

  const openBets = bets.filter((b) => b.status === "OPEN");
  const settledBets = bets.filter((b) => b.status === "SETTLED");
  const voidedBets = bets.filter((b) => b.status === "VOIDED");

  function toggleSelect(betId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(betId)) next.delete(betId);
      else next.add(betId);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(openBets.map((b) => b.id)));
  }

  function exitBulkMode() {
    setBulkMode(false);
    setSelected(new Set());
    setBulkWin(false);
  }

  async function handleBulkSettle(result: "LOSS" | "PUSH") {
    setSettling(true);
    const settlements = [...selected].map((betId) => {
      const bet = openBets.find((b) => b.id === betId)!;
      return {
        betId,
        result: result as "WIN" | "LOSS" | "PUSH",
        payoutCashUnits: result === "LOSS" ? 0 : bet.stakeCashUnits,
      };
    });
    await bulkSettle(settlements);
    exitBulkMode();
    router.refresh();
    setSettling(false);
  }

  async function handleBulkWin() {
    setSettling(true);
    const settlements = [...selected].map((betId) => {
      const payout = parseInt(winPayouts[betId]) || 0;
      return { betId, result: "WIN" as const, payoutCashUnits: payout };
    });
    await bulkSettle(settlements);
    exitBulkMode();
    router.refresh();
    setSettling(false);
  }

  function startBulkWin() {
    const defaults: Record<string, string> = {};
    for (const betId of selected) {
      const bet = openBets.find((b) => b.id === betId)!;
      defaults[betId] = String(calculateDefaultPayout(bet.stakeCashUnits, bet.oddsAmerican));
    }
    setWinPayouts(defaults);
    setBulkWin(true);
  }

  async function handleAutoSettle() {
    setAutoSettling(true);
    setAutoError("");
    setAutoSuggestions([]);
    setAcceptedIds(new Set());
    setDismissedIds(new Set());

    try {
      const res = await fetch("/api/auto-settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bets: openBets.map((b) => ({
            id: b.id,
            description: b.description,
            oddsAmerican: b.oddsAmerican,
            stakeCashUnits: b.stakeCashUnits,
            eventKey: b.eventKey,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to auto-settle");

      setAutoSuggestions(data.suggestions || []);
      setGamesChecked(data.gamesChecked || 0);

      if (data.message) setAutoError(data.message);
    } catch (err) {
      setAutoError(
        err instanceof Error ? err.message : "Failed to fetch scores"
      );
    } finally {
      setAutoSettling(false);
    }
  }

  function toggleAccept(betId: string) {
    setAcceptedIds((prev) => {
      const next = new Set(prev);
      if (next.has(betId)) next.delete(betId);
      else next.add(betId);
      return next;
    });
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.delete(betId);
      return next;
    });
  }

  function dismissSuggestion(betId: string) {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(betId);
      return next;
    });
    setAcceptedIds((prev) => {
      const next = new Set(prev);
      next.delete(betId);
      return next;
    });
  }

  function acceptAll() {
    const actionable = autoSuggestions.filter(
      (s) => s.result !== "SKIP" && !dismissedIds.has(s.betId)
    );
    setAcceptedIds(new Set(actionable.map((s) => s.betId)));
  }

  async function applyAccepted() {
    setApplyingAuto(true);
    const settlements = autoSuggestions
      .filter((s) => acceptedIds.has(s.betId) && s.result !== "SKIP")
      .map((s) => {
        const bet = openBets.find((b) => b.id === s.betId)!;
        let payoutCashUnits = 0;
        if (s.result === "WIN") {
          payoutCashUnits = calculateDefaultPayout(
            bet.stakeCashUnits,
            bet.oddsAmerican
          );
        } else if (s.result === "PUSH") {
          payoutCashUnits = bet.stakeCashUnits;
        }
        return {
          betId: s.betId,
          result: s.result as "WIN" | "LOSS" | "PUSH",
          payoutCashUnits,
        };
      });

    if (settlements.length > 0) {
      await bulkSettle(settlements);
    }
    setAutoSuggestions([]);
    setAcceptedIds(new Set());
    setDismissedIds(new Set());
    setApplyingAuto(false);
    router.refresh();
  }

  function clearAutoSettle() {
    setAutoSuggestions([]);
    setAcceptedIds(new Set());
    setDismissedIds(new Set());
    setAutoError("");
  }

  return (
    <div className="space-y-6">
      {openBets.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-yellow-400 uppercase tracking-wide">
              Open ({openBets.length})
            </h3>
            {weekStatus === "OPEN" && (
              <div className="flex items-center gap-3">
                {openBets.length > 0 && (
                  <button
                    onClick={handleAutoSettle}
                    disabled={autoSettling}
                    className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 disabled:text-gray-500"
                  >
                    {autoSettling ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Zap size={12} />
                    )}
                    {autoSettling ? "Checking..." : "Auto Settle"}
                  </button>
                )}
                {openBets.length > 1 && (
                  <button
                    onClick={() => bulkMode ? exitBulkMode() : setBulkMode(true)}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    {bulkMode ? "Cancel" : "Bulk Settle"}
                  </button>
                )}
              </div>
            )}
          </div>

          {bulkMode && (
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={selectAll}
                className="text-xs text-gray-400 hover:text-white"
              >
                Select All
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-gray-400 hover:text-white"
              >
                Deselect All
              </button>
            </div>
          )}

          <div className="space-y-2">
            {openBets.map((bet) => (
              <OpenBetCard
                key={bet.id}
                bet={bet}
                weekId={weekId}
                weekStatus={weekStatus}
                bulkMode={bulkMode}
                isSelected={selected.has(bet.id)}
                onToggle={() => toggleSelect(bet.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Auto Settle Suggestions */}
      {autoError && autoSuggestions.length === 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <p className="text-red-400 text-sm">{autoError}</p>
        </div>
      )}

      {autoSuggestions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-purple-400 uppercase tracking-wide">
              Auto Settle Suggestions
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">
                {gamesChecked} games checked
              </span>
              <button
                onClick={clearAutoSettle}
                className="text-xs text-gray-400 hover:text-white"
              >
                Dismiss
              </button>
            </div>
          </div>

          <div className="space-y-2 mb-3">
            {autoSuggestions
              .filter((s) => !dismissedIds.has(s.betId))
              .map((s) => {
                const bet = openBets.find((b) => b.id === s.betId);
                if (!bet) return null;
                const isAccepted = acceptedIds.has(s.betId);
                const isSkip = s.result === "SKIP";

                return (
                  <div
                    key={s.betId}
                    className={`bg-gray-900 rounded-lg border p-3 ${
                      isAccepted
                        ? "border-green-500/50"
                        : isSkip
                        ? "border-gray-800 opacity-60"
                        : "border-gray-800"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">
                          {bet.description}
                        </p>
                        <p className="text-gray-500 text-xs mt-0.5">
                          {bet.member.name} · {bet.stakeCashUnits}u · {bet.oddsAmerican > 0 ? "+" : ""}{bet.oddsAmerican}
                        </p>
                        {s.matchedGame && (
                          <p className="text-gray-400 text-xs mt-1">
                            🏟 {s.matchedGame}
                          </p>
                        )}
                        <p className="text-gray-500 text-xs mt-0.5 italic">
                          {s.reason}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-bold ${
                            s.result === "WIN"
                              ? "bg-green-500/10 text-green-400"
                              : s.result === "LOSS"
                              ? "bg-red-500/10 text-red-400"
                              : s.result === "PUSH"
                              ? "bg-gray-700 text-gray-300"
                              : "bg-gray-800 text-gray-500"
                          }`}
                        >
                          {s.result}
                        </span>
                        {!isSkip && (
                          <>
                            <button
                              onClick={() => toggleAccept(s.betId)}
                              className={`p-1 rounded transition-colors ${
                                isAccepted
                                  ? "bg-green-500/20 text-green-400"
                                  : "bg-gray-800 text-gray-500 hover:text-green-400"
                              }`}
                              title="Accept"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => dismissSuggestion(s.betId)}
                              className="p-1 rounded bg-gray-800 text-gray-500 hover:text-red-400 transition-colors"
                              title="Dismiss"
                            >
                              <X size={14} />
                            </button>
                          </>
                        )}
                        {isSkip && (
                          <span className="p-1 text-gray-600">
                            <SkipForward size={14} />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Action bar for accepted suggestions */}
          {autoSuggestions.filter((s) => s.result !== "SKIP" && !dismissedIds.has(s.betId)).length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={acceptAll}
                className="text-xs text-purple-400 hover:text-purple-300"
              >
                Accept All
              </button>
              {acceptedIds.size > 0 && (
                <button
                  onClick={applyAccepted}
                  disabled={applyingAuto}
                  className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {applyingAuto ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Zap size={14} />
                  )}
                  {applyingAuto
                    ? "Settling..."
                    : `Apply ${acceptedIds.size} Settlement${acceptedIds.size > 1 ? "s" : ""}`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {settledBets.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
            Settled ({settledBets.length})
          </h3>
          <div className="space-y-2">
            {settledBets.map((bet) => (
              <SettledBetCard key={bet.id} bet={bet} />
            ))}
          </div>
        </div>
      )}

      {voidedBets.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-600 uppercase tracking-wide mb-3">
            Voided ({voidedBets.length})
          </h3>
          <div className="space-y-2">
            {voidedBets.map((bet) => (
              <VoidedBetCard key={bet.id} bet={bet} />
            ))}
          </div>
        </div>
      )}

      {/* Bulk Settle Action Bar */}
      {bulkMode && selected.size > 0 && !bulkWin && (
        <div className="fixed bottom-16 md:bottom-0 left-0 right-0 md:left-56 bg-gray-900 border-t border-gray-800 p-3 z-40">
          <div className="max-w-4xl mx-auto flex items-center gap-2">
            <span className="text-white text-sm font-medium mr-auto">
              {selected.size} selected
            </span>
            <button
              onClick={() => handleBulkSettle("LOSS")}
              disabled={settling}
              className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-medium rounded-lg transition-colors"
            >
              All Loss
            </button>
            <button
              onClick={() => handleBulkSettle("PUSH")}
              disabled={settling}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium rounded-lg transition-colors"
            >
              All Push
            </button>
            <button
              onClick={startBulkWin}
              disabled={settling}
              className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 text-xs font-medium rounded-lg transition-colors"
            >
              All Win
            </button>
          </div>
        </div>
      )}

      {/* Bulk Win Payout Form */}
      {bulkWin && (
        <div className="fixed bottom-16 md:bottom-0 left-0 right-0 md:left-56 bg-gray-900 border-t border-gray-800 p-3 z-40 max-h-[60vh] overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-white text-sm font-medium">
                Set payouts ({selected.size} bets)
              </span>
              <button
                onClick={() => setBulkWin(false)}
                className="text-xs text-gray-400 hover:text-white"
              >
                Back
              </button>
            </div>
            {[...selected].map((betId) => {
              const bet = openBets.find((b) => b.id === betId)!;
              return (
                <div key={betId} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs truncate">{bet.description}</p>
                    <p className="text-gray-500 text-xs">{bet.member.name} &middot; {bet.stakeFreePlayUnits > 0 ? `${bet.stakeFreePlayUnits} FP` : `${bet.stakeCashUnits}u`}</p>
                  </div>
                  <input
                    type="number"
                    value={winPayouts[betId] || ""}
                    onChange={(e) => setWinPayouts((p) => ({ ...p, [betId]: e.target.value }))}
                    className="w-24 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              );
            })}
            <button
              onClick={handleBulkWin}
              disabled={settling}
              className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white font-medium rounded-lg transition-colors"
            >
              {settling ? "Settling..." : "Confirm Win Settle"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function OpenBetCard({
  bet,
  weekId,
  weekStatus,
  bulkMode,
  isSelected,
  onToggle,
}: {
  bet: Bet;
  weekId: string;
  weekStatus: string;
  bulkMode: boolean;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const [settling, setSettling] = useState(false);
  const router = useRouter();

  async function handleQuickSettle(result: "LOSS" | "PUSH") {
    setSettling(true);
    await quickSettle(bet.id, result);
    router.refresh();
    setSettling(false);
  }

  return (
    <div
      className={`bg-gray-900 rounded-lg border p-3 ${
        bulkMode && isSelected ? "border-blue-500" : "border-gray-800"
      } ${bulkMode ? "cursor-pointer" : ""}`}
      onClick={bulkMode ? onToggle : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        {bulkMode && (
          <div className="pt-0.5">
            <div
              className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                isSelected
                  ? "bg-blue-500 border-blue-500"
                  : "border-gray-600"
              }`}
            >
              {isSelected && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium text-sm truncate">
            {bet.description}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-500">{bet.member.name}</span>
            <span className="text-xs text-gray-600">&middot;</span>
            <span className="text-xs text-gray-500">
              {bet.oddsAmerican > 0 ? "+" : ""}
              {bet.oddsAmerican}
            </span>
            <span className="text-xs text-gray-600">&middot;</span>
            <span className="text-xs text-gray-500">
              {bet.stakeFreePlayUnits > 0
                ? `${bet.stakeFreePlayUnits} FP`
                : `${bet.stakeCashUnits} units`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {bet.stakeFreePlayUnits > 0 && (
            <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded text-xs font-medium">
              FP
            </span>
          )}
          <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-400 rounded text-xs font-medium">
            OPEN
          </span>
        </div>
      </div>

      {weekStatus === "OPEN" && !bulkMode && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => handleQuickSettle("LOSS")}
            disabled={settling}
            className="flex-1 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium rounded transition-colors"
          >
            Loss
          </button>
          <button
            onClick={() => handleQuickSettle("PUSH")}
            disabled={settling}
            className="flex-1 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium rounded transition-colors"
          >
            Push
          </button>
          <Link
            href={`/weeks/${weekId}/bets/${bet.id}/settle`}
            className="flex-1 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 text-xs font-medium rounded text-center transition-colors"
          >
            Win
          </Link>
          <Link
            href={`/weeks/${weekId}/bets/${bet.id}/edit`}
            className="py-1.5 px-2.5 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs font-medium rounded transition-colors"
          >
            Edit
          </Link>
        </div>
      )}
    </div>
  );
}

function SettledBetCard({ bet }: { bet: Bet }) {
  const isFP = bet.stakeFreePlayUnits > 0;
  const profit = (bet.payoutCashUnits ?? 0) - bet.stakeCashUnits;

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium text-sm truncate">
            {bet.description}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-500">{bet.member.name}</span>
            <span className="text-xs text-gray-600">&middot;</span>
            <span className="text-xs text-gray-500">
              {bet.oddsAmerican > 0 ? "+" : ""}
              {bet.oddsAmerican}
            </span>
            <span className="text-xs text-gray-600">&middot;</span>
            <span className="text-xs text-gray-500">
              {isFP
                ? `${bet.stakeFreePlayUnits} FP`
                : `${bet.stakeCashUnits} units`}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="flex items-center gap-1.5 justify-end">
            {isFP && (
              <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded text-xs font-medium">
                FP
              </span>
            )}
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                bet.result === "WIN"
                  ? "bg-green-500/10 text-green-400"
                  : bet.result === "LOSS"
                  ? "bg-red-500/10 text-red-400"
                  : "bg-gray-700 text-gray-400"
              }`}
            >
              {bet.result}
            </span>
          </div>
          <p
            className={`text-xs mt-1 font-medium ${
              profit > 0
                ? "text-green-400"
                : profit < 0
                ? "text-red-400"
                : "text-gray-400"
            }`}
          >
            {profit >= 0 ? "+" : ""}
            {profit} units
          </p>
        </div>
      </div>
    </div>
  );
}

function VoidedBetCard({ bet }: { bet: Bet }) {
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-3 opacity-50">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium text-sm truncate line-through">
            {bet.description}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-500">{bet.member.name}</span>
            <span className="text-xs text-gray-600">&middot;</span>
            <span className="text-xs text-gray-500">
              {bet.oddsAmerican > 0 ? "+" : ""}
              {bet.oddsAmerican}
            </span>
            <span className="text-xs text-gray-600">&middot;</span>
            <span className="text-xs text-gray-500">
              {bet.stakeFreePlayUnits > 0
                ? `${bet.stakeFreePlayUnits} FP`
                : `${bet.stakeCashUnits} units`}
            </span>
          </div>
        </div>
        <span className="px-2 py-0.5 bg-gray-700 text-gray-500 rounded text-xs font-medium shrink-0">
          VOIDED
        </span>
      </div>
    </div>
  );
}
