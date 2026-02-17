"use client";

import { useState } from "react";
import { createPromo } from "@/lib/actions";
import { useRouter } from "next/navigation";

export function CreatePromoForm({
  weekId,
  weekStart,
  weekEnd,
}: {
  weekId: string;
  weekStart: string;
  weekEnd: string;
}) {
  const [name, setName] = useState("");
  const [percentBack, setPercentBack] = useState("50");
  const [minHandleUnits, setMinHandleUnits] = useState("100");
  const [capUnits, setCapUnits] = useState("500");
  const [oddsMin, setOddsMin] = useState("");
  const [oddsMax, setOddsMax] = useState("");
  const [disqualifyBothSides, setDisqualifyBothSides] = useState(true);
  const [windowStart, setWindowStart] = useState(weekStart.slice(0, 16));
  const [windowEnd, setWindowEnd] = useState(weekEnd.slice(0, 16));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name || !percentBack || !minHandleUnits || !capUnits) return;

    setLoading(true);
    try {
      await createPromo({
        weekId,
        name,
        type: "LOSS_REBATE",
        ruleJson: {
          windowStart: new Date(windowStart).toISOString(),
          windowEnd: new Date(windowEnd).toISOString(),
          minHandleUnits: parseInt(minHandleUnits),
          percentBack: parseInt(percentBack),
          capUnits: parseInt(capUnits),
          oddsMin: oddsMin ? parseInt(oddsMin) : null,
          oddsMax: oddsMax ? parseInt(oddsMax) : null,
          disqualifyBothSides,
        },
      });
      router.push(`/weeks/${weekId}/promos`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create promo");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Promo Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Golf Loss Rebate 50%"
          className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-4">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
          Loss Rebate Rules
        </p>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">% Back</label>
            <input
              type="number"
              value={percentBack}
              onChange={(e) => setPercentBack(e.target.value)}
              min="1"
              max="100"
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              Min Handle
            </label>
            <input
              type="number"
              value={minHandleUnits}
              onChange={(e) => setMinHandleUnits(e.target.value)}
              min="0"
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Cap</label>
            <input
              type="number"
              value={capUnits}
              onChange={(e) => setCapUnits(e.target.value)}
              min="0"
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              Min Odds (optional)
            </label>
            <input
              type="number"
              value={oddsMin}
              onChange={(e) => setOddsMin(e.target.value)}
              placeholder="-300"
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              Max Odds (optional)
            </label>
            <input
              type="number"
              value={oddsMax}
              onChange={(e) => setOddsMax(e.target.value)}
              placeholder="+500"
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              Window Start
            </label>
            <input
              type="datetime-local"
              value={windowStart}
              onChange={(e) => setWindowStart(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              Window End
            </label>
            <input
              type="datetime-local"
              value={windowEnd}
              onChange={(e) => setWindowEnd(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
          <input
            type="checkbox"
            checked={disqualifyBothSides}
            onChange={(e) => setDisqualifyBothSides(e.target.checked)}
            className="rounded bg-gray-800 border-gray-600"
          />
          Disqualify if member bet both sides of same event
        </label>
      </div>

      {/* Preview */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
        <p className="text-xs text-gray-500 mb-2">Preview</p>
        <p className="text-sm text-gray-300">
          Bet at least{" "}
          <span className="text-white font-medium">{minHandleUnits || 0} units</span>{" "}
          {oddsMin || oddsMax ? (
            <>
              at odds{" "}
              {oddsMin && <span className="text-white font-medium">{oddsMin}</span>}
              {oddsMin && oddsMax && " to "}
              {oddsMax && <span className="text-white font-medium">{oddsMax}</span>}
            </>
          ) : null}
          . Get{" "}
          <span className="text-blue-400 font-medium">{percentBack || 0}% back</span>{" "}
          on losses as free play (capped at{" "}
          <span className="text-white font-medium">{capUnits || 0} units</span>).
        </p>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={loading || !name}
        className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors"
      >
        {loading ? "Creating..." : "Create Promo"}
      </button>
    </form>
  );
}
