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
  Clock,
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

        // Start cooldown
        setCooldown(60);
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

  // Format odds display
  function fmtOdds(odds: number): string {
    return odds > 0 ? `+${odds}` : `${odds}`;
  }

  // Format time
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

  // EV badge color
  function evColor(ev: number): string {
    if (ev >= 5) return "bg-green-500/15 text-green-400 border-green-500/30";
    if (ev >= 2) return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
    return "bg-blue-500/15 text-blue-400 border-blue-500/30";
  }

  const sports = [
    { key: "all", label: "All" },
    ...SPORT_MAP.filter((s) => s.active).map((s) => ({
      key: s.internalKey,
      label: s.displayName,
    })),
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp size={24} className="text-green-400" />
            EV Finder
          </h2>
          <div className="flex items-center gap-3 mt-1">
            {lastUpdated && (
              <span className="text-gray-500 text-xs flex items-center gap-1">
                <Clock size={12} />
                {timeAgo(lastUpdated)}
              </span>
            )}
            {credits.remaining !== null && (
              <span className="text-gray-600 text-xs">
                {credits.remaining} credits left
              </span>
            )}
            <span className="text-gray-600 text-xs">
              {totalEvents} events
            </span>
          </div>
        </div>
        <button
          onClick={() => fetchData()}
          disabled={loading || cooldown > 0}
          className="p-2.5 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-lg transition-colors relative"
          title={cooldown > 0 ? `Wait ${cooldown}s` : "Refresh odds"}
        >
          <RefreshCw
            size={18}
            className={loading ? "animate-spin" : ""}
          />
          {cooldown > 0 && (
            <span className="absolute -bottom-1 -right-1 text-[10px] bg-gray-700 text-gray-400 rounded px-1">
              {cooldown}
            </span>
          )}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-1">
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
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab.key
                ? "bg-gray-800 text-white"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab.label}
            {tab.key === "arbs" && filteredArbs.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded-full">
                {filteredArbs.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Sport Filter Pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {sports.map((s) => (
          <button
            key={s.key}
            onClick={() => setSelectedSport(s.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
              selectedSport === s.key
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 text-xs">
        {activeTab === "ev" && (
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">Min EV:</span>
            {[0, 1, 2, 5].map((v) => (
              <button
                key={v}
                onClick={() => setMinEV(v)}
                className={`px-2 py-1 rounded transition-colors ${
                  minEV === v
                    ? "bg-gray-700 text-white"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {v}%
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <p className="text-red-400 text-sm">{error}</p>
          {error.includes("ODDS_API_KEY") && (
            <p className="text-red-400/70 text-xs mt-1">
              Add your API key from the-odds-api.com as ODDS_API_KEY in
              Vercel env vars.
            </p>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-gray-500" />
          <span className="ml-2 text-gray-500 text-sm">Loading odds...</span>
        </div>
      )}

      {/* EV Finder Tab */}
      {!loading && activeTab === "ev" && (
        <div className="space-y-2">
          {filteredBets.length === 0 ? (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
              <TrendingUp size={32} className="mx-auto text-gray-700 mb-2" />
              <p className="text-gray-500 text-sm">No +EV bets found</p>
              <p className="text-gray-600 text-xs mt-1">
                {evBets.length > 0
                  ? "Try adjusting your filters"
                  : "Check back closer to game time when lines are sharper"}
              </p>
            </div>
          ) : (
            <>
              <p className="text-gray-500 text-xs">
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
        <div className="space-y-2">
          {filteredArbs.length === 0 ? (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
              <Triangle size={32} className="mx-auto text-gray-700 mb-2" />
              <p className="text-gray-500 text-sm">
                No arbitrage opportunities found
              </p>
              <p className="text-gray-600 text-xs mt-1">
                Arbs are rare — they appear when books disagree on odds
                enough to guarantee profit.
              </p>
            </div>
          ) : (
            <>
              <p className="text-gray-500 text-xs">
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
        <div className="space-y-2">
          {filteredBets.length === 0 ? (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
              <p className="text-gray-500 text-sm">No events loaded</p>
            </div>
          ) : (
            <>
              {/* Deduplicate events */}
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
                    className="w-full bg-gray-900 rounded-xl border border-gray-800 p-4 text-left hover:border-gray-700 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white text-sm font-medium">
                          {bet.awayTeam} @ {bet.homeTeam}
                        </p>
                        <p className="text-gray-500 text-xs mt-0.5">
                          {bet.sportDisplay} &middot; {fmtTime(bet.commenceTime)}
                        </p>
                      </div>
                      {expandedEvent === bet.eventId ? (
                        <ChevronUp size={16} className="text-gray-500" />
                      ) : (
                        <ChevronDown size={16} className="text-gray-500" />
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
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* EV Badge + Book */}
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className={`px-2 py-0.5 text-xs font-bold rounded border ${evColor(bet.evPercent)}`}
            >
              +{bet.evPercent.toFixed(1)}% EV
            </span>
            <span className="text-blue-400 text-xs font-medium">
              {bet.bookName}
            </span>
          </div>

          {/* Outcome + Odds */}
          <div className="flex items-baseline gap-2">
            <p className="text-white font-semibold text-sm">
              {bet.outcomeName}
              {bet.point !== undefined && (
                <span className="text-gray-400 ml-1">
                  {bet.point > 0 ? `+${bet.point}` : bet.point}
                </span>
              )}
            </p>
            <span className="text-green-400 font-mono text-sm font-bold">
              {fmtOdds(bet.bookOdds)}
            </span>
          </div>

          {/* Event info */}
          <p className="text-gray-500 text-xs mt-1">
            {bet.awayTeam} @ {bet.homeTeam} &middot;{" "}
            {bet.sportDisplay} &middot; {fmtTime(bet.commenceTime)}
          </p>

          {/* Sharp line comparison */}
          <p className="text-gray-600 text-xs mt-1">
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
        <div className="flex flex-col gap-1.5 shrink-0">
          {bet.bookLink ? (
            <a
              href={bet.bookLink}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors"
            >
              Bet
              <ExternalLink size={12} />
            </a>
          ) : (
            <span className="px-3 py-2 bg-gray-800 text-gray-500 text-xs rounded-lg">
              Manual
            </span>
          )}
          <button
            onClick={onExpand}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs rounded-lg transition-colors"
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
    <div className="bg-gradient-to-r from-yellow-500/5 to-amber-500/5 border border-yellow-500/20 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 text-xs font-bold bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 rounded">
              +{arb.arbPercent.toFixed(2)}% Profit
            </span>
            <span className="text-gray-500 text-xs uppercase">
              {arb.market === "h2h"
                ? "ML"
                : arb.market === "spreads"
                  ? "Spread"
                  : "Total"}
            </span>
          </div>
          <p className="text-white text-sm font-medium">
            {arb.awayTeam} @ {arb.homeTeam}
          </p>
          <p className="text-gray-500 text-xs mt-0.5">
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
              className={`flex items-center justify-between p-2.5 rounded-lg ${
                isUser
                  ? "bg-blue-500/10 border border-blue-500/20"
                  : "bg-gray-900/50 border border-gray-800"
              }`}
            >
              <div>
                <p className="text-white text-sm">
                  {leg.outcomeName}
                  {leg.point !== undefined && (
                    <span className="text-gray-400 ml-1">
                      {leg.point > 0 ? `+${leg.point}` : leg.point}
                    </span>
                  )}
                </p>
                <p className="text-gray-500 text-xs">
                  {BOOK_DISPLAY_NAMES[leg.bookKey] || leg.bookName} &middot;
                  Stake: {leg.stakePercent.toFixed(1)}%
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-400 font-mono text-sm font-bold">
                  {fmtOdds(leg.odds)}
                </span>
                {leg.link && (
                  <a
                    href={leg.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
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
      <div className="bg-gray-900/50 border-x border-b border-gray-800 rounded-b-xl p-4 flex items-center justify-center">
        <Loader2 size={16} className="animate-spin text-gray-500" />
        <span className="ml-2 text-gray-500 text-sm">Loading lines...</span>
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
    <div className="bg-gray-900/50 border-x border-b border-gray-800 rounded-b-xl p-3 space-y-4 -mt-1">
      {detail.markets.map((market) => (
        <div key={market.key}>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
            {marketLabels[market.key] || market.key}
          </p>
          <div className="space-y-1.5">
            {market.lines.map((line, li) => (
              <div key={li} className="space-y-1">
                <p className="text-white text-xs font-medium">
                  {line.outcomeName}
                  {line.point !== undefined && (
                    <span className="text-gray-400 ml-1">
                      {line.point > 0 ? `+${line.point}` : line.point}
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {line.books
                    .filter((b) => b.isUserBook)
                    .sort((a, b) => b.odds - a.odds)
                    .map((book) => (
                      <a
                        key={book.bookKey}
                        href={book.link || "#"}
                        target={book.link ? "_blank" : undefined}
                        rel={book.link ? "noopener noreferrer" : undefined}
                        className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                          book.isBest
                            ? "bg-green-500/15 text-green-400 border border-green-500/30 font-bold"
                            : book.isUserBook
                              ? "bg-blue-500/10 text-blue-300 border border-blue-500/20"
                              : "bg-gray-800 text-gray-400 border border-gray-700"
                        } ${book.link ? "hover:opacity-80 cursor-pointer" : "cursor-default"}`}
                        title={`${book.bookName}: ${fmtOdds(book.odds)}`}
                      >
                        <span className="text-[10px] text-gray-500 block leading-tight">
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
