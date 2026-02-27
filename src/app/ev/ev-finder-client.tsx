"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  TrendingUp,
  Loader2,
  RefreshCw,
  ExternalLink,
  Triangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { EVBet, ArbOpportunity, GameOddsDetail } from "@/lib/ev-engine";
import { SPORT_MAP, USER_BOOKS, BOOK_DISPLAY_NAMES } from "@/lib/odds-api";

type Tab = "ev" | "arbs" | "lines";

export function EVFinderClient() {
  const [activeTab, setActiveTab] = useState<Tab>("ev");
  const [selectedSport, setSelectedSport] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Data
  const [evBets, setEvBets] = useState<EVBet[]>([]);
  const [arbs, setArbs] = useState<ArbOpportunity[]>([]);
  const [totalEvents, setTotalEvents] = useState(0);
  const [lastUpdated, setLastUpdated] = useState("");
  const [credits, setCredits] = useState<{
    used: number;
    remaining: number | null;
  }>({ used: 0, remaining: null });

  // Filters
  const [minEV, setMinEV] = useState(0);

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Line shopping
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [lineDetail, setLineDetail] = useState<GameOddsDetail | null>(null);
  const [loadingLines, setLoadingLines] = useState(false);

  // Refresh cooldown
  const [cooldown, setCooldown] = useState(0);

  const fetchData = useCallback(
    async (force?: boolean) => {
      if (cooldown > 0 && !force) return;
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams();
        if (selectedSport !== "all") params.set("sport", selectedSport);
        params.set("mode", activeTab === "lines" ? "ev" : activeTab);
        params.set("markets", "h2h");

        const res = await fetch(`/api/odds?${params}`);
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || "Failed to load");

        if (activeTab === "arbs") {
          setArbs(data.arbs || []);
        } else {
          setEvBets(data.bets || []);
        }

        setTotalEvents(data.totalEvents || 0);
        setLastUpdated(data.lastUpdated || "");
        if (data.credits) setCredits(data.credits);

        setCooldown(30);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load odds");
      } finally {
        setLoading(false);
      }
    },
    [selectedSport, activeTab, cooldown]
  );

  // Fetch on mount and tab/sport change
  useEffect(() => {
    fetchData(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSport, activeTab]);

  // Auto-refresh every 2 minutes
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchData(true);
    }, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Expand game for line shopping
  async function handleExpandGame(eventId: string, sportKey: string) {
    if (expandedEvent === eventId) {
      setExpandedEvent(null);
      setLineDetail(null);
      return;
    }
    setExpandedEvent(eventId);
    setLoadingLines(true);

    try {
      const params = new URLSearchParams({
        mode: "lines",
        eventId,
        sportKey,
        markets: "h2h,spreads,totals",
      });
      const res = await fetch(`/api/odds?${params}`);
      const data = await res.json();
      if (data.detail) {
        setLineDetail(data.detail);
      }
      if (data.credits) setCredits(data.credits);
    } catch {
      // Non-critical
    } finally {
      setLoadingLines(false);
    }
  }

  // Filter EV bets — only show user's books
  const filteredBets = useMemo(() => {
    let filtered = evBets.filter((b) => b.isUserBook);
    if (minEV > 0) {
      filtered = filtered.filter((b) => b.evPercent >= minEV);
    }
    return filtered;
  }, [evBets, minEV]);

  // Filter arbs — only show arbs where ALL legs are at user books
  const filteredArbs = useMemo(() => {
    return arbs.filter((a) =>
      a.legs.every((l) =>
        (USER_BOOKS as readonly string[]).includes(l.bookKey)
      )
    );
  }, [arbs]);

  // Time ago helper
  function timeAgo(iso: string): string {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins === 1) return "1 min ago";
    return `${mins} min ago`;
  }

  function fmtOdds(odds: number): string {
    return odds > 0 ? `+${odds}` : `${odds}`;
  }

  function fmtTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function evColor(ev: number): string {
    if (ev >= 5) return "bg-[#30d158]/15 text-[#30d158]";
    if (ev >= 2) return "bg-[#ffd60a]/15 text-[#ffd60a]";
    return "bg-[#0a84ff]/15 text-[#0a84ff]";
  }

  const sports = [
    { key: "all", label: "All" },
    ...SPORT_MAP.filter((s) => s.active).map((s) => ({
      key: s.internalKey,
      label: s.displayName,
    })),
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">
            EV Finder
          </h2>
          <div className="flex items-center gap-3 mt-2">
            {lastUpdated && (
              <span className="text-[#6e6e73] text-xs flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#30d158] animate-pulse" />
                {timeAgo(lastUpdated)}
              </span>
            )}
            {credits.remaining !== null && (
              <span className="text-[#48484a] text-xs">
                {credits.remaining} credits
              </span>
            )}
            <span className="text-[#48484a] text-xs">
              {totalEvents} events
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-2 rounded-xl text-xs font-medium ${
              autoRefresh
                ? "bg-[#30d158]/15 text-[#30d158] border border-[#30d158]/20"
                : "bg-white/[0.05] text-[#6e6e73] border border-white/[0.06]"
            }`}
          >
            {autoRefresh ? "Live" : "Paused"}
          </button>
          <button
            onClick={() => fetchData()}
            disabled={loading || cooldown > 0}
            className="p-2.5 bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-30 text-white rounded-xl border border-white/[0.06] hover:border-white/[0.1] relative"
            title={cooldown > 0 ? `Wait ${cooldown}s` : "Refresh odds"}
          >
            <RefreshCw
              size={18}
              className={loading ? "animate-spin" : ""}
            />
            {cooldown > 0 && (
              <span className="absolute -bottom-1 -right-1 text-[10px] bg-white/[0.1] text-[#a1a1a6] rounded-full px-1.5 font-mono">
                {cooldown}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Tabs — Segmented Control */}
      <div className="flex gap-0.5 bg-white/[0.05] rounded-2xl p-1 border border-white/[0.06]">
        {(
          [
            { key: "ev" as Tab, label: "EV Finder" },
            { key: "arbs" as Tab, label: "Arb Finder" },
            { key: "lines" as Tab, label: "Line Shop" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2.5 text-sm font-medium rounded-xl ${
              activeTab === tab.key
                ? "bg-white/[0.1] text-white shadow-sm shadow-black/20"
                : "text-[#6e6e73] hover:text-[#a1a1a6]"
            }`}
          >
            {tab.label}
            {tab.key === "arbs" && filteredArbs.length > 0 && (
              <span className="ml-1.5 px-2 py-0.5 text-[11px] font-bold bg-[#ffd60a]/15 text-[#ffd60a] rounded-full">
                {filteredArbs.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Sport Filter Pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {sports.map((s) => (
          <button
            key={s.key}
            onClick={() => setSelectedSport(s.key)}
            className={`px-4 py-2 text-xs font-medium rounded-full whitespace-nowrap ${
              selectedSport === s.key
                ? "bg-[#0a84ff] text-white shadow-lg shadow-blue-500/25"
                : "bg-white/[0.05] text-[#a1a1a6] hover:bg-white/[0.1] hover:text-white border border-white/[0.06]"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      {activeTab === "ev" && (
        <div className="flex items-center gap-2">
          <span className="text-[#6e6e73] text-xs font-medium">Min EV</span>
          <div className="flex gap-0.5 bg-white/[0.05] rounded-full p-0.5 border border-white/[0.06]">
            {[0, 1, 2, 5].map((v) => (
              <button
                key={v}
                onClick={() => setMinEV(v)}
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  minEV === v
                    ? "bg-white/[0.15] text-white"
                    : "text-[#6e6e73] hover:text-[#a1a1a6]"
                }`}
              >
                {v}%
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-[#ff453a]/[0.08] border border-[#ff453a]/15 rounded-2xl p-4">
          <p className="text-[#ff453a] text-sm font-medium">{error}</p>
          {error.includes("ODDS_API_KEY") && (
            <p className="text-[#ff453a]/60 text-xs mt-1">
              Add your API key from the-odds-api.com as ODDS_API_KEY in
              Vercel env vars.
            </p>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 size={28} className="animate-spin text-[#0a84ff]" />
          <span className="text-[#6e6e73] text-sm">Scanning odds...</span>
        </div>
      )}

      {/* EV Finder Tab */}
      {!loading && activeTab === "ev" && (
        <div className="space-y-3">
          {filteredBets.length === 0 ? (
            <div className="bg-white/[0.02] rounded-2xl border border-white/[0.06] p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.05] flex items-center justify-center mx-auto mb-3">
                <TrendingUp size={24} className="text-[#48484a]" />
              </div>
              <p className="text-[#a1a1a6] text-sm font-medium">No +EV bets found</p>
              <p className="text-[#48484a] text-xs mt-1.5 max-w-xs mx-auto">
                {evBets.length > 0
                  ? "Try adjusting your filters"
                  : "Check back closer to game time when lines are sharper"}
              </p>
            </div>
          ) : (
            <>
              <p className="text-[#6e6e73] text-xs">
                {filteredBets.length} +EV bet
                {filteredBets.length !== 1 ? "s" : ""} found
              </p>
              {filteredBets.map((bet, i) => (
                <div key={`${bet.eventId}-${bet.bookKey}-${bet.outcomeName}-${bet.market}-${i}`}>
                  <EVBetCard
                    bet={bet}
                    fmtOdds={fmtOdds}
                    fmtTime={fmtTime}
                    evColor={evColor}
                    expanded={expandedEvent === bet.eventId}
                    onExpand={() =>
                      handleExpandGame(bet.eventId, bet.sport)
                    }
                  />
                  {expandedEvent === bet.eventId && (
                    <LineShoppingPanel
                      detail={lineDetail}
                      loading={loadingLines}
                      fmtOdds={fmtOdds}
                    />
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Arb Finder Tab */}
      {!loading && activeTab === "arbs" && (
        <div className="space-y-3">
          {filteredArbs.length === 0 ? (
            <div className="bg-white/[0.02] rounded-2xl border border-white/[0.06] p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.05] flex items-center justify-center mx-auto mb-3">
                <Triangle size={24} className="text-[#48484a]" />
              </div>
              <p className="text-[#a1a1a6] text-sm font-medium">
                No arbitrage opportunities found
              </p>
              <p className="text-[#48484a] text-xs mt-1.5 max-w-xs mx-auto">
                Arbs are rare — they appear when books disagree on odds
                enough to guarantee profit.
              </p>
            </div>
          ) : (
            <>
              <p className="text-[#6e6e73] text-xs">
                {filteredArbs.length} arb
                {filteredArbs.length !== 1 ? "s" : ""} found
              </p>
              {filteredArbs.map((arb, i) => (
                <ArbCard key={`${arb.eventId}-${arb.market}-${i}`} arb={arb} fmtOdds={fmtOdds} fmtTime={fmtTime} />
              ))}
            </>
          )}
        </div>
      )}

      {/* Line Shopping Tab */}
      {!loading && activeTab === "lines" && (
        <div className="space-y-3">
          {filteredBets.length === 0 ? (
            <div className="bg-white/[0.02] rounded-2xl border border-white/[0.06] p-12 text-center">
              <p className="text-[#a1a1a6] text-sm font-medium">No events loaded</p>
            </div>
          ) : (
            <>
              {Array.from(
                new Map(
                  filteredBets.map((b) => [b.eventId, b])
                ).values()
              ).map((bet) => (
                <div key={bet.eventId}>
                  <button
                    onClick={() =>
                      handleExpandGame(bet.eventId, bet.sport)
                    }
                    className="w-full bg-white/[0.03] rounded-2xl border border-white/[0.06] p-5 text-left hover:bg-white/[0.05] hover:border-white/[0.1]"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white text-[15px] font-semibold">
                          {bet.awayTeam} @ {bet.homeTeam}
                        </p>
                        <p className="text-[#6e6e73] text-xs mt-1">
                          {bet.sportDisplay} &middot; {fmtTime(bet.commenceTime)}
                        </p>
                      </div>
                      {expandedEvent === bet.eventId ? (
                        <ChevronUp size={16} className="text-[#6e6e73]" />
                      ) : (
                        <ChevronDown size={16} className="text-[#6e6e73]" />
                      )}
                    </div>
                  </button>
                  {expandedEvent === bet.eventId && (
                    <LineShoppingPanel
                      detail={lineDetail}
                      loading={loadingLines}
                      fmtOdds={fmtOdds}
                    />
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── EV Bet Card ─────────────────────────────────────────────────────

function EVBetCard({
  bet,
  fmtOdds,
  fmtTime,
  evColor,
  expanded,
  onExpand,
}: {
  bet: EVBet;
  fmtOdds: (n: number) => string;
  fmtTime: (s: string) => string;
  evColor: (n: number) => string;
  expanded: boolean;
  onExpand: () => void;
}) {
  return (
    <div className="bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl border border-white/[0.06] hover:border-white/[0.1] p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* EV Badge + Book */}
          <div className="flex items-center gap-2.5 mb-2">
            <span
              className={`px-2.5 py-1 text-xs font-bold rounded-full ${evColor(bet.evPercent)}`}
            >
              +{bet.evPercent.toFixed(1)}% EV
            </span>
            <span className="text-[#0a84ff] text-xs font-medium">
              {bet.bookName}
            </span>
          </div>

          {/* Outcome + Odds */}
          <div className="flex items-baseline gap-2.5">
            <p className="text-white font-semibold text-[15px]">
              {bet.outcomeName}
              {bet.point !== undefined && (
                <span className="text-[#a1a1a6] ml-1.5">
                  {bet.point > 0 ? `+${bet.point}` : bet.point}
                </span>
              )}
            </p>
            <span className="text-[#30d158] font-mono text-sm font-bold">
              {fmtOdds(bet.bookOdds)}
            </span>
          </div>

          {/* Event info */}
          <p className="text-[#6e6e73] text-xs mt-1.5">
            {bet.awayTeam} @ {bet.homeTeam} &middot;{" "}
            {bet.sportDisplay} &middot; {fmtTime(bet.commenceTime)}
          </p>

          {/* Sharp line comparison */}
          <p className="text-[#48484a] text-xs mt-1.5">
            True prob: {(bet.noVigProb * 100).toFixed(1)}% &middot;
            Pinnacle: {fmtOdds(bet.pinnacleOdds)}
            {bet.bestOddsBook !== bet.bookKey && (
              <>
                {" "}&middot; Best: {fmtOdds(bet.bestOdds)} at{" "}
                {bet.bestOddsBookName}
              </>
            )}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2 shrink-0">
          {bet.bookLink ? (
            <a
              href={bet.bookLink}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 bg-[#30d158] hover:bg-[#34d65c] text-black text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-lg shadow-green-500/20"
            >
              Bet
              <ExternalLink size={12} />
            </a>
          ) : (
            <span className="px-4 py-2.5 bg-white/[0.05] text-[#6e6e73] text-xs font-medium rounded-xl border border-white/[0.06]">
              Manual
            </span>
          )}
          <button
            onClick={onExpand}
            className="px-4 py-2 bg-white/[0.05] hover:bg-white/[0.1] text-[#a1a1a6] hover:text-white text-xs font-medium rounded-xl border border-white/[0.06] hover:border-white/[0.1]"
          >
            {expanded ? "Hide" : "Lines"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Arb Card ────────────────────────────────────────────────────────

function ArbCard({
  arb,
  fmtOdds,
  fmtTime,
}: {
  arb: ArbOpportunity;
  fmtOdds: (n: number) => string;
  fmtTime: (s: string) => string;
}) {
  return (
    <div className="bg-gradient-to-br from-[#ffd60a]/[0.04] to-amber-500/[0.02] rounded-2xl border border-[#ffd60a]/15 p-5 space-y-4 hover:border-[#ffd60a]/25">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <span className="px-2.5 py-1 text-xs font-bold bg-[#ffd60a]/15 text-[#ffd60a] rounded-full">
              +{arb.arbPercent.toFixed(2)}% Profit
            </span>
            <span className="text-[#6e6e73] text-xs uppercase tracking-wider font-medium">
              {arb.market === "h2h"
                ? "ML"
                : arb.market === "spreads"
                  ? "Spread"
                  : "Total"}
            </span>
          </div>
          <p className="text-white text-[15px] font-semibold">
            {arb.awayTeam} @ {arb.homeTeam}
          </p>
          <p className="text-[#6e6e73] text-xs mt-1">
            {arb.sportDisplay} &middot; {fmtTime(arb.commenceTime)}
          </p>
        </div>
      </div>

      {/* Legs */}
      <div className="space-y-2">
        {arb.legs.map((leg, i) => {
          const isUser = (USER_BOOKS as readonly string[]).includes(
            leg.bookKey
          );
          return (
            <div
              key={i}
              className={`flex items-center justify-between p-3.5 rounded-xl ${
                isUser
                  ? "bg-[#0a84ff]/[0.08] border border-[#0a84ff]/15"
                  : "bg-white/[0.03] border border-white/[0.06]"
              }`}
            >
              <div>
                <p className="text-white text-sm font-medium">
                  {leg.outcomeName}
                  {leg.point !== undefined && (
                    <span className="text-[#a1a1a6] ml-1.5">
                      {leg.point > 0 ? `+${leg.point}` : leg.point}
                    </span>
                  )}
                </p>
                <p className="text-[#6e6e73] text-xs mt-0.5">
                  {BOOK_DISPLAY_NAMES[leg.bookKey] || leg.bookName} &middot;
                  Stake: {leg.stakePercent.toFixed(1)}%
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="text-[#30d158] font-mono text-sm font-bold">
                  {fmtOdds(leg.odds)}
                </span>
                {leg.link && (
                  <a
                    href={leg.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 bg-[#30d158] hover:bg-[#34d65c] text-black rounded-lg shadow-lg shadow-green-500/20"
                  >
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Line Shopping Panel ─────────────────────────────────────────────

function LineShoppingPanel({
  detail,
  loading,
  fmtOdds,
}: {
  detail: GameOddsDetail | null;
  loading: boolean;
  fmtOdds: (n: number) => string;
}) {
  if (loading) {
    return (
      <div className="bg-white/[0.02] border-x border-b border-white/[0.06] rounded-b-2xl p-5 flex items-center justify-center">
        <Loader2 size={16} className="animate-spin text-[#6e6e73]" />
        <span className="ml-2 text-[#6e6e73] text-sm">Loading lines...</span>
      </div>
    );
  }

  if (!detail) return null;

  const marketLabels: Record<string, string> = {
    h2h: "Moneyline",
    spreads: "Spread",
    totals: "Total",
  };

  return (
    <div className="bg-white/[0.02] border-x border-b border-white/[0.06] rounded-b-2xl p-4 space-y-5 -mt-2">
      {detail.markets.map((market) => (
        <div key={market.key}>
          <p className="text-xs font-semibold text-[#a1a1a6] uppercase tracking-wider mb-3">
            {marketLabels[market.key] || market.key}
          </p>
          <div className="space-y-3">
            {market.lines.map((line, li) => (
              <div key={li} className="space-y-2">
                <p className="text-white text-xs font-semibold">
                  {line.outcomeName}
                  {line.point !== undefined && (
                    <span className="text-[#a1a1a6] ml-1.5">
                      {line.point > 0 ? `+${line.point}` : line.point}
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {line.books
                    .filter((b) => b.isUserBook)
                    .sort((a, b) => b.odds - a.odds)
                    .map((book) => (
                      <a
                        key={book.bookKey}
                        href={book.link || "#"}
                        target={book.link ? "_blank" : undefined}
                        rel={book.link ? "noopener noreferrer" : undefined}
                        className={`px-3 py-2 rounded-xl text-xs font-mono ${
                          book.isBest
                            ? "bg-[#30d158]/10 text-[#30d158] border border-[#30d158]/20 font-bold shadow-sm shadow-green-500/10"
                            : "bg-[#0a84ff]/[0.06] text-[#64b5f6] border border-[#0a84ff]/15"
                        } ${book.link ? "hover:scale-[1.02] cursor-pointer" : "cursor-default"}`}
                        title={`${book.bookName}: ${fmtOdds(book.odds)}`}
                      >
                        <span className="text-[10px] text-[#6e6e73] block leading-tight mb-0.5">
                          {book.bookName}
                        </span>
                        {fmtOdds(book.odds)}
                      </a>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
