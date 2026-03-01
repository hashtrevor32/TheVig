"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  TrendingUp,
  Loader2,
  RefreshCw,
  ExternalLink,
  Triangle,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Zap,
  Sparkles,
} from "lucide-react";
import type { EVBet, ArbOpportunity, GameOddsDetail } from "@/lib/ev-engine";
import { SPORT_MAP, USER_BOOKS, BOOK_DISPLAY_NAMES, SHARP_PICKS_SPORTS } from "@/lib/odds-api";
import type { SharpPicksResponse, SharpPickCategory } from "@/lib/sharp-picks-engine";

type Tab = "ev" | "arbs" | "lines";

export function EVFinderClient() {
  const [activeTab, setActiveTab] = useState<Tab>("ev");
  const [selectedSport, setSelectedSport] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Data
  const [evBets, setEvBets] = useState<EVBet[]>([]);
  const [allEvents, setAllEvents] = useState<{ eventId: string; sport: string; sportDisplay: string; homeTeam: string; awayTeam: string; commenceTime: string }[]>([]);
  const [arbs, setArbs] = useState<ArbOpportunity[]>([]);
  const [totalEvents, setTotalEvents] = useState(0);
  const [lastUpdated, setLastUpdated] = useState("");
  const [credits, setCredits] = useState<{
    used: number;
    remaining: number | null;
  }>({ used: 0, remaining: null });

  // Filters
  const [minEV, setMinEV] = useState(8);

  // Arb wager input (shared across all arb cards)
  const [arbWager, setArbWager] = useState(100);
  const [arbWagerInput, setArbWagerInput] = useState("100");

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Line shopping
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [lineDetail, setLineDetail] = useState<GameOddsDetail | null>(null);
  const [loadingLines, setLoadingLines] = useState(false);

  // Sharp picks
  const [sharpPicks, setSharpPicks] = useState<Record<string, SharpPicksResponse>>({});
  const [loadingSharpPicks, setLoadingSharpPicks] = useState(false);
  const [sharpPicksError, setSharpPicksError] = useState("");
  const [expandedSubTab, setExpandedSubTab] = useState<"lines" | "sharp">("lines");

  // Refresh cooldown
  const [cooldown, setCooldown] = useState(0);

  // Use ref to track cooldown without causing fetchData to re-create
  const cooldownRef = useRef(cooldown);
  cooldownRef.current = cooldown;

  const fetchData = useCallback(
    async (force?: boolean) => {
      if (cooldownRef.current > 0 && !force) return;
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams();
        if (selectedSport !== "all") params.set("sport", selectedSport);
        params.set("mode", activeTab === "lines" ? "ev" : activeTab);
        params.set("markets", activeTab === "arbs" ? "h2h,spreads,totals" : "h2h");

        const res = await fetch(`/api/odds?${params}`);
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || "Failed to load");

        if (activeTab === "arbs") {
          setArbs(data.arbs || []);
        } else {
          setEvBets(data.bets || []);
          if (data.events) setAllEvents(data.events);
        }

        setTotalEvents(data.totalEvents || 0);
        setLastUpdated(data.lastUpdated || "");
        if (data.credits) setCredits(data.credits);

        setCooldown(10);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load odds");
      } finally {
        setLoading(false);
      }
    },
    [selectedSport, activeTab]
  );

  // Fetch on mount and tab/sport change
  useEffect(() => {
    fetchData(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSport, activeTab]);

  // Pause auto-refresh when tab is hidden (saves credits if you forget a window open)
  const [tabVisible, setTabVisible] = useState(true);
  useEffect(() => {
    const handleVisibility = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Auto-refresh every 2 minutes — only when tab is visible
  useEffect(() => {
    if (!autoRefresh || !tabVisible) return;
    const interval = setInterval(() => {
      fetchData(true);
    }, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [autoRefresh, tabVisible, fetchData]);

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
    setExpandedSubTab("lines");
    setSharpPicksError("");
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

  // Fetch sharp picks for an event
  async function handleFetchSharpPicks(eventId: string, sportKey: string) {
    if (sharpPicks[eventId]) return;
    setLoadingSharpPicks(true);
    setSharpPicksError("");

    try {
      const res = await fetch("/api/sharp-picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sportKey, eventId }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to generate picks");

      setSharpPicks((prev) => ({ ...prev, [eventId]: data }));
      if (data.credits) setCredits(data.credits);
    } catch (err) {
      setSharpPicksError(
        err instanceof Error ? err.message : "Failed to generate picks"
      );
    } finally {
      setLoadingSharpPicks(false);
    }
  }

  // Filter EV bets — only show user's books, minimum 8% EV
  const filteredBets = useMemo(() => {
    return evBets
      .filter((b) => b.isUserBook)
      .filter((b) => b.evPercent >= minEV);
  }, [evBets, minEV]);

  // Filter arbs — only show arbs where ALL legs are at user books, minimum 1% profit
  const filteredArbs = useMemo(() => {
    return arbs.filter(
      (a) =>
        a.arbPercent >= 1 &&
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
    if (ev >= 5) return "bg-emerald-100 text-emerald-700";
    if (ev >= 2) return "bg-amber-100 text-amber-700";
    return "bg-blue-100 text-blue-700";
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
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
            EV Finder
          </h2>
          <div className="flex items-center gap-3 mt-2">
            {lastUpdated && (
              <span className="text-slate-400 text-xs flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {timeAgo(lastUpdated)}
              </span>
            )}
            {credits.remaining !== null && (
              <span className="text-slate-300 text-xs">
                {credits.remaining} credits
              </span>
            )}
            <span className="text-slate-300 text-xs">
              {totalEvents} events
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-2 rounded-xl text-xs font-medium ${
              autoRefresh
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-slate-100 text-slate-400 border border-slate-200"
            }`}
          >
            {autoRefresh ? "Live" : "Paused"}
          </button>
          <button
            onClick={() => fetchData()}
            disabled={loading || cooldown > 0}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-600 rounded-xl border border-slate-200 hover:border-slate-300 relative"
            title={cooldown > 0 ? `Wait ${cooldown}s` : "Refresh odds"}
          >
            <RefreshCw
              size={18}
              className={loading ? "animate-spin" : ""}
            />
            {cooldown > 0 && (
              <span className="absolute -bottom-1 -right-1 text-[10px] bg-slate-200 text-slate-500 rounded-full px-1.5 font-mono">
                {cooldown}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Tabs — Segmented Control */}
      <div className="flex gap-0.5 bg-slate-100 rounded-2xl p-1 border border-slate-200">
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
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
            {tab.key === "arbs" && activeTab === "arbs" && filteredArbs.length > 0 && (
              <span className="ml-1.5 px-2 py-0.5 text-[11px] font-bold bg-amber-100 text-amber-700 rounded-full">
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
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/25"
                : "bg-white text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      {activeTab === "ev" && (
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-xs font-medium">Min EV</span>
          <div className="flex gap-0.5 bg-slate-100 rounded-full p-0.5 border border-slate-200">
            {[5, 8, 10, 15].map((v) => (
              <button
                key={v}
                onClick={() => setMinEV(v)}
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  minEV === v
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-400 hover:text-slate-600"
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
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <p className="text-red-600 text-sm font-medium">{error}</p>
          {error.includes("ODDS_API_KEY") && (
            <p className="text-red-400 text-xs mt-1">
              Add your API key from the-odds-api.com as ODDS_API_KEY in
              Vercel env vars.
            </p>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 size={28} className="animate-spin text-blue-600" />
          <span className="text-slate-400 text-sm">Scanning odds...</span>
        </div>
      )}

      {/* EV Finder Tab */}
      {!loading && activeTab === "ev" && (
        <div className="space-y-3">
          {filteredBets.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <TrendingUp size={24} className="text-slate-300" />
              </div>
              <p className="text-slate-500 text-sm font-medium">No +EV bets found</p>
              <p className="text-slate-400 text-xs mt-1.5 max-w-xs mx-auto">
                {evBets.length > 0
                  ? "Try adjusting your filters"
                  : "Check back closer to game time when lines are sharper"}
              </p>
            </div>
          ) : (
            <>
              <p className="text-slate-400 text-xs">
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
                    <ExpandedPanel
                      sportKey={bet.sport}
                      eventId={bet.eventId}
                      expandedSubTab={expandedSubTab}
                      setExpandedSubTab={setExpandedSubTab}
                      lineDetail={lineDetail}
                      loadingLines={loadingLines}
                      fmtOdds={fmtOdds}
                      sharpPicks={sharpPicks[bet.eventId] || null}
                      loadingSharpPicks={loadingSharpPicks}
                      sharpPicksError={sharpPicksError}
                      onFetchSharpPicks={() =>
                        handleFetchSharpPicks(bet.eventId, bet.sport)
                      }
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
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <Triangle size={24} className="text-slate-300" />
              </div>
              <p className="text-slate-500 text-sm font-medium">
                No arbitrage opportunities found
              </p>
              <p className="text-slate-400 text-xs mt-1.5 max-w-xs mx-auto">
                Arbs are rare — they appear when books disagree on odds
                enough to guarantee profit.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-slate-400 text-xs">
                  {filteredArbs.length} arb
                  {filteredArbs.length !== 1 ? "s" : ""} found
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-xs">Total Wager</span>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">$</span>
                    <input
                      type="number"
                      value={arbWagerInput}
                      onChange={(e) => {
                        setArbWagerInput(e.target.value);
                        const num = Number(e.target.value);
                        if (num > 0) setArbWager(num);
                      }}
                      onBlur={() => {
                        const num = Math.max(1, Number(arbWagerInput) || 0);
                        setArbWager(num);
                        setArbWagerInput(String(num));
                      }}
                      className="w-24 pl-6 pr-2.5 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-900 text-sm font-mono text-right focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                    />
                  </div>
                </div>
              </div>
              {filteredArbs.map((arb, i) => (
                <ArbCard key={`${arb.eventId}-${arb.market}-${i}`} arb={arb} fmtOdds={fmtOdds} fmtTime={fmtTime} wager={arbWager} />
              ))}
            </>
          )}
        </div>
      )}

      {/* Line Shopping Tab */}
      {!loading && activeTab === "lines" && (
        <div className="space-y-3">
          {allEvents.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
              <p className="text-slate-500 text-sm font-medium">No events loaded</p>
            </div>
          ) : (
            <>
              <p className="text-slate-400 text-xs">
                {allEvents.length} event{allEvents.length !== 1 ? "s" : ""}
              </p>
              {allEvents.map((evt) => (
                <div key={evt.eventId}>
                  <button
                    onClick={() =>
                      handleExpandGame(evt.eventId, evt.sport)
                    }
                    className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-left hover:bg-slate-50 hover:border-slate-300"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-slate-900 text-[15px] font-semibold">
                          {evt.awayTeam} @ {evt.homeTeam}
                        </p>
                        <p className="text-slate-400 text-xs mt-1">
                          {evt.sportDisplay} &middot; {fmtTime(evt.commenceTime)}
                        </p>
                      </div>
                      {expandedEvent === evt.eventId ? (
                        <ChevronUp size={16} className="text-slate-400" />
                      ) : (
                        <ChevronDown size={16} className="text-slate-400" />
                      )}
                    </div>
                  </button>
                  {expandedEvent === evt.eventId && (
                    <ExpandedPanel
                      sportKey={evt.sport}
                      eventId={evt.eventId}
                      expandedSubTab={expandedSubTab}
                      setExpandedSubTab={setExpandedSubTab}
                      lineDetail={lineDetail}
                      loadingLines={loadingLines}
                      fmtOdds={fmtOdds}
                      sharpPicks={sharpPicks[evt.eventId] || null}
                      loadingSharpPicks={loadingSharpPicks}
                      sharpPicksError={sharpPicksError}
                      onFetchSharpPicks={() =>
                        handleFetchSharpPicks(evt.eventId, evt.sport)
                      }
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
    <div className="bg-white hover:bg-slate-50 rounded-2xl border border-slate-200 hover:border-slate-300 shadow-sm p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* EV Badge + Book */}
          <div className="flex items-center gap-2.5 mb-2">
            <span
              className={`px-2.5 py-1 text-xs font-bold rounded-full ${evColor(bet.evPercent)}`}
            >
              +{bet.evPercent.toFixed(1)}% EV
            </span>
            <span className="text-blue-600 text-xs font-medium">
              {bet.bookName}
            </span>
          </div>

          {/* Outcome + Odds */}
          <div className="flex items-baseline gap-2.5">
            <p className="text-slate-900 font-semibold text-[15px]">
              {bet.outcomeName}
              {bet.point !== undefined && (
                <span className="text-slate-400 ml-1.5">
                  {bet.point > 0 ? `+${bet.point}` : bet.point}
                </span>
              )}
            </p>
            <span className="text-emerald-600 font-mono text-sm font-bold">
              {fmtOdds(bet.bookOdds)}
            </span>
          </div>

          {/* Event info */}
          <p className="text-slate-400 text-xs mt-1.5">
            {bet.awayTeam} @ {bet.homeTeam} &middot;{" "}
            {bet.sportDisplay} &middot; {fmtTime(bet.commenceTime)}
          </p>

          {/* Sharp line comparison */}
          <p className="text-slate-300 text-xs mt-1.5">
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
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
            >
              Bet
              <ExternalLink size={12} />
            </a>
          ) : (
            <span className="px-4 py-2.5 bg-slate-100 text-slate-400 text-xs font-medium rounded-xl border border-slate-200">
              Manual
            </span>
          )}
          <button
            onClick={onExpand}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 text-xs font-medium rounded-xl border border-slate-200 hover:border-slate-300"
          >
            {expanded ? "Hide" : "Lines"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Arb Card (Speed-Optimized) ──────────────────────────────────────

function toDecimal(american: number): number {
  return american < 0 ? 1 + 100 / Math.abs(american) : 1 + american / 100;
}

function CopyAmount({ amount }: { amount: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(amount);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Fallback for older browsers
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 group"
      title="Copy amount"
    >
      <span className="text-slate-900 text-lg font-mono font-bold group-hover:text-blue-600">
        ${amount}
      </span>
      {copied ? (
        <Check size={12} className="text-emerald-600" />
      ) : (
        <Copy size={12} className="text-slate-300 group-hover:text-blue-600" />
      )}
    </button>
  );
}

function ArbCard({
  arb,
  fmtOdds,
  fmtTime,
  wager,
}: {
  arb: ArbOpportunity;
  fmtOdds: (n: number) => string;
  fmtTime: (s: string) => string;
  wager: number;
}) {
  // Cap the largest leg at $1000
  const maxStakePct = Math.max(...arb.legs.map((l) => l.stakePercent));
  const maxWager = maxStakePct > 0 ? Math.floor(1000 / (maxStakePct / 100)) : 1000;
  const effectiveWager = Math.min(wager, maxWager);

  const guaranteedProfit = effectiveWager * (arb.arbPercent / 100);
  const totalPayout = effectiveWager + guaranteedProfit;

  const openAllLegs = () => {
    // Open all leg links. Most browsers allow multiple window.open in
    // the same synchronous click handler. For browsers that block the
    // 2nd+ popup, we fall back to creating hidden <a> elements and
    // clicking them, which has better popup-blocker compatibility.
    const links = arb.legs.filter((l) => l.link).map((l) => l.link!);
    if (links.length === 0) return;

    // Try window.open for the first link (always works)
    window.open(links[0], "_blank");

    // For remaining links, use programmatic <a> click (less likely to be blocked)
    for (let i = 1; i < links.length; i++) {
      const a = document.createElement("a");
      a.href = links[i];
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const hasLinks = arb.legs.some((l) => l.link);

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-200 overflow-hidden hover:border-amber-300 shadow-sm">
      {/* Header — game info + Open All */}
      <div className="p-4 pb-3 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2 py-0.5 text-xs font-bold bg-amber-100 text-amber-700 rounded-full shrink-0">
              +{arb.arbPercent.toFixed(2)}%
            </span>
            <span className="text-slate-400 text-[10px] uppercase tracking-wider font-medium shrink-0">
              {arb.market === "h2h"
                ? "ML"
                : arb.market === "spreads"
                  ? "Spread"
                  : "Total"}
            </span>
            <span className="text-slate-300 text-[10px]">&middot;</span>
            <span className="text-slate-400 text-[10px] truncate">
              {arb.sportDisplay} &middot; {fmtTime(arb.commenceTime)}
            </span>
          </div>
          <p className="text-slate-900 text-[15px] font-semibold truncate">
            {arb.awayTeam} @ {arb.homeTeam}
          </p>
        </div>
        {hasLinks && (
          <button
            onClick={openAllLegs}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/25 shrink-0 active:scale-95"
          >
            <Zap size={13} />
            Open All
          </button>
        )}
      </div>

      {/* Legs — compact speed layout */}
      <div className="px-4 space-y-1.5">
        {arb.legs.map((leg, i) => {
          const stake = effectiveWager * (leg.stakePercent / 100);
          const payout = stake * toDecimal(leg.odds);
          return (
            <div
              key={i}
              className="bg-white border border-slate-200 rounded-xl px-3.5 py-3 flex items-center gap-3 shadow-sm"
            >
              {/* Book + Outcome */}
              <div className="flex-1 min-w-0">
                <p className="text-blue-600 text-xs font-semibold">
                  {BOOK_DISPLAY_NAMES[leg.bookKey] || leg.bookName}
                </p>
                <p className="text-slate-900 text-sm font-medium truncate">
                  {leg.outcomeName}
                  {leg.point !== undefined && (
                    <span className="text-slate-400 ml-1">
                      {leg.point > 0 ? `+${leg.point}` : leg.point}
                    </span>
                  )}
                </p>
              </div>

              {/* Bet amount — tap to copy */}
              <div className="text-center shrink-0">
                <p className="text-slate-400 text-[9px] uppercase tracking-wider mb-0.5">Bet</p>
                <CopyAmount amount={stake.toFixed(2)} />
              </div>

              {/* Odds */}
              <div className="text-center shrink-0 w-16">
                <p className="text-slate-400 text-[9px] uppercase tracking-wider mb-0.5">Odds</p>
                <p className="text-emerald-600 font-mono text-sm font-bold">{fmtOdds(leg.odds)}</p>
              </div>

              {/* Payout */}
              <div className="text-right shrink-0">
                <p className="text-slate-400 text-[9px] uppercase tracking-wider mb-0.5">Payout</p>
                <p className="text-slate-500 font-mono text-sm">${payout.toFixed(2)}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Guaranteed Profit Bar */}
      <div className="mx-4 mt-2.5 mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
        <div>
          <p className="text-slate-400 text-[9px] uppercase tracking-wider">Stake</p>
          <p className="text-slate-900 text-sm font-mono font-semibold">${effectiveWager.toFixed(2)}</p>
        </div>
        <div className="text-center">
          <p className="text-slate-400 text-[9px] uppercase tracking-wider">Return</p>
          <p className="text-slate-900 text-sm font-mono font-semibold">${totalPayout.toFixed(2)}</p>
        </div>
        <div className="text-right">
          <p className="text-emerald-600 text-[9px] uppercase tracking-wider font-medium">Profit</p>
          <p className="text-emerald-600 text-lg font-mono font-bold">${guaranteedProfit.toFixed(2)}</p>
        </div>
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
      <div className="p-5 flex items-center justify-center">
        <Loader2 size={16} className="animate-spin text-slate-400" />
        <span className="ml-2 text-slate-400 text-sm">Loading lines...</span>
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
    <div className="p-4 space-y-5">
      {detail.markets.map((market) => (
        <div key={market.key}>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            {marketLabels[market.key] || market.key}
          </p>
          <div className="space-y-3">
            {market.lines.map((line, li) => (
              <div key={li} className="space-y-2">
                <p className="text-slate-900 text-xs font-semibold">
                  {line.outcomeName}
                  {line.point !== undefined && (
                    <span className="text-slate-400 ml-1.5">
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
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold shadow-sm"
                            : "bg-blue-50 text-blue-700 border border-blue-200"
                        } ${book.link ? "hover:scale-[1.02] cursor-pointer" : "cursor-default"}`}
                        title={`${book.bookName}: ${fmtOdds(book.odds)}`}
                      >
                        <span className="text-[10px] text-slate-400 block leading-tight mb-0.5">
                          {book.bookName}
                        </span>
                        {fmtOdds(book.odds)}
                      </a>
                    ))}
                  <a
                    href="https://play23.ag/sportsbook.php"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 rounded-xl text-xs font-mono bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200 hover:scale-[1.02] cursor-pointer"
                    title="Check Play23.AG odds"
                  >
                    <span className="text-[10px] text-slate-400 block leading-tight mb-0.5">
                      Play23
                    </span>
                    Check
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Expanded Panel (Lines + Sharp Picks sub-tabs) ────────────────────

function ExpandedPanel({
  sportKey,
  eventId,
  expandedSubTab,
  setExpandedSubTab,
  lineDetail,
  loadingLines,
  fmtOdds,
  sharpPicks,
  loadingSharpPicks,
  sharpPicksError,
  onFetchSharpPicks,
}: {
  sportKey: string;
  eventId: string;
  expandedSubTab: "lines" | "sharp";
  setExpandedSubTab: (tab: "lines" | "sharp") => void;
  lineDetail: GameOddsDetail | null;
  loadingLines: boolean;
  fmtOdds: (n: number) => string;
  sharpPicks: SharpPicksResponse | null;
  loadingSharpPicks: boolean;
  sharpPicksError: string;
  onFetchSharpPicks: () => void;
}) {
  const isSharp = SHARP_PICKS_SPORTS.has(sportKey);

  return (
    <div
      className={`border-x border-b rounded-b-2xl -mt-2 overflow-hidden ${
        isSharp && expandedSubTab === "sharp"
          ? "border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      {isSharp && (
        <div className="flex p-1 mx-3 mt-3 rounded-xl border border-slate-200/60 bg-white/50 backdrop-blur-sm">
          <button
            onClick={() => setExpandedSubTab("lines")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
              expandedSubTab === "lines"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            Lines
          </button>
          <button
            onClick={() => {
              setExpandedSubTab("sharp");
              onFetchSharpPicks();
            }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg flex items-center justify-center gap-1 transition-all ${
              expandedSubTab === "sharp"
                ? "bg-white text-indigo-600 shadow-sm"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <Sparkles size={11} />
            Sharp Picks
          </button>
        </div>
      )}

      {(!isSharp || expandedSubTab === "lines") && (
        <LineShoppingPanel
          detail={lineDetail}
          loading={loadingLines}
          fmtOdds={fmtOdds}
        />
      )}

      {isSharp && expandedSubTab === "sharp" && (
        <SharpPicksPanel
          picks={sharpPicks}
          loading={loadingSharpPicks}
          error={sharpPicksError}
          onFetch={onFetchSharpPicks}
        />
      )}
    </div>
  );
}

// ── Sharp Picks Panel ────────────────────────────────────────────────

function SharpPicksPanel({
  picks,
  loading,
  error,
  onFetch,
}: {
  picks: SharpPicksResponse | null;
  loading: boolean;
  error: string;
  onFetch: () => void;
}) {
  if (loading) {
    return (
      <div className="p-10 flex flex-col items-center justify-center gap-3">
        <div className="relative">
          <Sparkles size={24} className="text-indigo-400 animate-pulse" />
          <Loader2
            size={16}
            className="animate-spin text-indigo-500 absolute -bottom-1 -right-1"
          />
        </div>
        <p className="text-slate-600 text-sm font-medium">
          Analyzing matchup...
        </p>
        <p className="text-slate-400 text-xs">This may take 15-20 seconds</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 text-sm font-medium mb-3">{error}</p>
        <button
          onClick={onFetch}
          className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-xl border border-slate-200 shadow-sm"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!picks) return null;

  const categoryOrder: SharpPickCategory[] = [
    "main_lines",
    "player_props",
    "game_props",
    "longshots",
  ];
  const categoryLabels: Record<SharpPickCategory, string> = {
    main_lines: "Main Lines",
    player_props: "Player Props",
    game_props: "Game Props",
    longshots: "Longshots",
  };

  const grouped = categoryOrder
    .map((cat) => ({
      category: cat,
      label: categoryLabels[cat],
      picks: picks.picks.filter((p) => p.category === cat),
    }))
    .filter((g) => g.picks.length > 0);

  const confidenceStyles: Record<string, string> = {
    high: "bg-emerald-100 text-emerald-700 border-emerald-200",
    medium: "bg-amber-100 text-amber-700 border-amber-200",
    speculative: "bg-violet-100 text-violet-700 border-violet-200",
  };

  return (
    <div className="p-4 space-y-4">
      {/* Analysis overview */}
      {picks.analysisNote && (
        <div className="bg-white/60 backdrop-blur-sm border border-indigo-100 rounded-xl p-3.5">
          <p className="text-slate-600 text-[13px] leading-relaxed">
            {picks.analysisNote}
          </p>
        </div>
      )}

      {/* Picks by category */}
      {grouped.map((group) => (
        <div key={group.category}>
          <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            {group.category === "longshots" && <span>🎯</span>}
            {group.label}
          </p>
          <div className="space-y-2.5">
            {group.picks.map((pick, i) => (
              <div
                key={i}
                className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-3 mb-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full border ${confidenceStyles[pick.confidence]}`}
                      >
                        {pick.confidence}
                      </span>
                      <span className="text-slate-400 text-[10px] font-medium">
                        {pick.marketLabel}
                      </span>
                      {pick.evPercent !== undefined && pick.evPercent > 0 && (
                        <span className="text-emerald-600 text-[10px] font-bold">
                          +{pick.evPercent.toFixed(1)}% EV
                        </span>
                      )}
                    </div>
                    <p className="text-slate-900 text-sm font-bold leading-snug">
                      {pick.pick}
                    </p>
                  </div>

                  {/* Bet button with book + odds */}
                  {pick.deepLink ? (
                    <a
                      href={pick.deepLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-500/20 text-center"
                    >
                      <span className="text-[9px] opacity-80 block mb-0.5">
                        {pick.bestBookName}
                      </span>
                      <span className="font-mono flex items-center gap-1">
                        {pick.bestOddsFormatted}
                        <ExternalLink size={9} />
                      </span>
                    </a>
                  ) : (
                    <span className="shrink-0 px-3 py-2 bg-slate-100 text-slate-500 text-xs font-medium rounded-xl border border-slate-200 text-center">
                      <span className="text-[9px] text-slate-400 block mb-0.5">
                        {pick.bestBookName}
                      </span>
                      <span className="font-mono">
                        {pick.bestOddsFormatted}
                      </span>
                    </span>
                  )}
                </div>

                {/* Reasoning */}
                <p className="text-slate-500 text-xs leading-relaxed">
                  {pick.reasoning}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Disclaimer */}
      <p className="text-slate-300 text-[10px] text-center pt-2">
        AI-generated analysis for informational purposes only. Always bet
        responsibly.
      </p>
    </div>
  );
}
