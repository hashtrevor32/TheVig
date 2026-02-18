"use client";

import { useState } from "react";
import { createPromoBatch } from "@/lib/actions";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, X } from "lucide-react";

type ParsedPromo = {
  name: string;
  type: "LOSS_REBATE";
  ruleJson: {
    windowStart: string;
    windowEnd: string;
    minHandleUnits: number;
    percentBack: number;
    capUnits: number;
    oddsMin: number | null;
    oddsMax: number | null;
    disqualifyBothSides: boolean;
  };
};

export function CreatePromoForm({
  weekId,
  weekStart,
  weekEnd,
}: {
  weekId: string;
  weekStart: string;
  weekEnd: string;
}) {
  const [description, setDescription] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [parsedPromos, setParsedPromos] = useState<ParsedPromo[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleParse() {
    if (!description.trim()) return;
    setParseError("");
    setParsing(true);
    setParsedPromos([]);

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
      setError(err instanceof Error ? err.message : "Failed to create promos");
    } finally {
      setCreating(false);
    }
  }

  function formatRule(rule: ParsedPromo["ruleJson"]) {
    const parts: string[] = [];
    parts.push(`${rule.percentBack}% back on losses`);
    if (rule.minHandleUnits > 0) {
      parts.push(`min ${rule.minHandleUnits} units bet`);
    }
    if (rule.capUnits < 9999) {
      parts.push(`cap ${rule.capUnits} units`);
    }
    if (rule.oddsMin != null) parts.push(`min odds ${rule.oddsMin}`);
    if (rule.oddsMax != null) parts.push(`max odds ${rule.oddsMax}`);
    return parts.join(" · ");
  }

  return (
    <div className="space-y-4">
      {/* AI Description Input */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">
          Describe your promos
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={"e.g. 50% loss rebate up to 200 units if they bet 500+ units.\n25 free play bonus for anyone who bets 1000+ units."}
          rows={4}
          className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      <button
        type="button"
        onClick={handleParse}
        disabled={parsing || !description.trim()}
        className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-700 disabled:to-gray-700 text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-all"
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

      {parseError && (
        <p className="text-red-400 text-sm">{parseError}</p>
      )}

      {/* Parsed Promos Preview */}
      {parsedPromos.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            {parsedPromos.length} promo{parsedPromos.length > 1 ? "s" : ""} detected
          </p>

          {parsedPromos.map((promo, i) => (
            <div
              key={i}
              className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm">{promo.name}</p>
                  <p className="text-gray-400 text-xs mt-1">
                    {formatRule(promo.ruleJson)}
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
