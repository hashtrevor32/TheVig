"use client";

import { useState, useEffect } from "react";
import { createPromoBatch } from "@/lib/actions";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, X, Calendar, Zap } from "lucide-react";
import { type ParsedPromo, formatPromoRule } from "@/lib/promo-types";

type EventSummary = {
  sport: string;
  league: string;
  name: string;
  shortName: string;
  date: string;
  isTournament: boolean;
};

export function CreatePromoForm({
  weekId,
  weekStart,
  weekEnd,
  existingPromoNames = [],
  autoSuggest = false,
}: {
  weekId: string;
  weekStart: string;
  weekEnd: string;
  existingPromoNames?: string[];
  autoSuggest?: boolean;
}) {
  const [description, setDescription] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [parsedPromos, setParsedPromos] = useState<ParsedPromo[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  // Suggest state
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState("");
  const [userEvents, setUserEvents] = useState("");
  const [showUserEvents, setShowUserEvents] = useState(false);
  const [fetchedEvents, setFetchedEvents] = useState<EventSummary[]>([]);

  // Auto-suggest on mount if ?suggest=true
  useEffect(() => {
    if (autoSuggest) {
      handleSuggest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleParse() {
    if (!description.trim()) return;
    setParseError("");
    setSuggestError("");
    setParsing(true);
    setParsedPromos([]);
    setFetchedEvents([]);

    try {
      const res = await fetch("/api/parse-promos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          weekStart,
          weekEnd,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to parse");
      }

      if (data.promos && data.promos.length > 0) {
        setParsedPromos(data.promos);
      } else {
        setParseError("No promos detected. Try being more specific.");
      }
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : "Failed to parse promos"
      );
    } finally {
      setParsing(false);
    }
  }

  async function handleSuggest() {
    setSuggestError("");
    setParseError("");
    setSuggesting(true);
    setParsedPromos([]);

    try {
      const res = await fetch("/api/suggest-promos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart,
          weekEnd,
          userEvents: userEvents.trim() || undefined,
          existingPromoNames:
            existingPromoNames.length > 0 ? existingPromoNames : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to suggest promos");
      }

      if (data.events) {
        setFetchedEvents(data.events);
      }

      if (data.promos && data.promos.length > 0) {
        setParsedPromos(data.promos);
      } else {
        setSuggestError(
          "No promos suggested. Try adding event details manually."
        );
      }
    } catch (err) {
      setSuggestError(
        err instanceof Error ? err.message : "Failed to suggest promos"
      );
    } finally {
      setSuggesting(false);
    }
  }

  function removePromo(index: number) {
    setParsedPromos((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCreateAll() {
    if (parsedPromos.length === 0) return;
    setError("");
    setCreating(true);

    try {
      await createPromoBatch(weekId, parsedPromos);
      router.push(`/weeks/${weekId}/promos`);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create promos"
      );
    } finally {
      setCreating(false);
    }
  }

  // Group fetched events by league for summary display
  const eventsByLeague: Record<string, EventSummary[]> = {};
  for (const e of fetchedEvents) {
    if (!eventsByLeague[e.league]) eventsByLeague[e.league] = [];
    eventsByLeague[e.league].push(e);
  }

  return (
    <div className="space-y-4">
      {/* Auto-Suggest from Schedule */}
      <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-purple-400" />
          <span className="text-sm font-medium text-purple-300">
            Suggest from Schedule
          </span>
        </div>
        <p className="text-gray-400 text-xs">
          AI fetches this week&apos;s sports schedule and suggests promos
          tailored to the events.
        </p>

        {/* Optional user events input */}
        <button
          type="button"
          onClick={() => setShowUserEvents(!showUserEvents)}
          className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
        >
          {showUserEvents
            ? "Hide additional events"
            : "+ Add events manually"}
        </button>
        {showUserEvents && (
          <textarea
            value={userEvents}
            onChange={(e) => setUserEvents(e.target.value)}
            placeholder="e.g. PGA Genesis Invitational, UFC 312, Champions League"
            rows={2}
            className="w-full px-3 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
          />
        )}

        <button
          type="button"
          onClick={handleSuggest}
          disabled={suggesting || parsing}
          className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-700 disabled:to-gray-700 text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-all"
        >
          {suggesting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Fetching schedule & generating...
            </>
          ) : (
            <>
              <Zap size={18} />
              Suggest Promos
            </>
          )}
        </button>
      </div>

      {/* Events Summary */}
      {fetchedEvents.length > 0 && (
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-3 space-y-1.5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            This Week&apos;s Events
          </p>
          {Object.entries(eventsByLeague).map(([league, events]) => (
            <p key={league} className="text-xs text-gray-500">
              <span className="text-gray-300 font-medium">{league}</span>
              {" — "}
              {events[0].isTournament
                ? events.map((e) => e.name).join(", ")
                : `${events.length} game${events.length > 1 ? "s" : ""}`}
            </p>
          ))}
        </div>
      )}

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-800" />
        <span className="text-xs text-gray-600">or describe manually</span>
        <div className="flex-1 h-px bg-gray-800" />
      </div>

      {/* Manual AI Description Input */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">
          Describe your promos
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={
            "e.g. 50% golf outright loss rebate up to 200 units if they bet 500+ units.\n30% NBA spread rebate, min 300 units."
          }
          rows={3}
          className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      <button
        type="button"
        onClick={handleParse}
        disabled={parsing || suggesting || !description.trim()}
        className="w-full py-3 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800 disabled:text-gray-600 text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-all"
      >
        {parsing ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Parsing promos...
          </>
        ) : (
          <>
            <Sparkles size={18} />
            Parse with AI
          </>
        )}
      </button>

      {/* Errors */}
      {parseError && <p className="text-red-400 text-sm">{parseError}</p>}
      {suggestError && <p className="text-red-400 text-sm">{suggestError}</p>}

      {/* Parsed/Suggested Promos Preview */}
      {parsedPromos.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            {parsedPromos.length} promo
            {parsedPromos.length > 1 ? "s" : ""}{" "}
            {fetchedEvents.length > 0 ? "suggested" : "detected"}
          </p>

          {parsedPromos.map((promo, i) => (
            <div
              key={i}
              className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm">
                    {promo.name}
                  </p>
                  <p className="text-gray-400 text-xs mt-1">
                    {formatPromoRule(promo.ruleJson)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removePromo(i)}
                  className="text-gray-500 hover:text-red-400 shrink-0"
                >
                  <X size={16} />
                </button>
              </div>
              {promo.ruleJson.disqualifyBothSides && (
                <p className="text-gray-600 text-xs">
                  DQ if member bets both sides
                </p>
              )}
            </div>
          ))}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="button"
            onClick={handleCreateAll}
            disabled={creating}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors"
          >
            {creating
              ? "Creating..."
              : `Create ${parsedPromos.length} Promo${parsedPromos.length > 1 ? "s" : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}
