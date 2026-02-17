"use client";

import { useState } from "react";
import { settleBet } from "@/lib/actions";
import { useRouter } from "next/navigation";

export function SettleForm({
  betId,
  weekId,
  stakeCashUnits,
}: {
  betId: string;
  weekId: string;
  stakeCashUnits: number;
}) {
  const [result, setResult] = useState<"WIN" | "LOSS" | "PUSH">("WIN");
  const [payoutCashUnits, setPayoutCashUnits] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const payout =
    result === "LOSS"
      ? 0
      : result === "PUSH"
      ? stakeCashUnits
      : parseInt(payoutCashUnits) || 0;
  const profit = payout - stakeCashUnits;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await settleBet({
      betId,
      result,
      payoutCashUnits: payout,
    });
    router.push(`/weeks/${weekId}/bets`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-xs text-gray-500 mb-2 block">Result</label>
        <div className="grid grid-cols-3 gap-2">
          {(["WIN", "LOSS", "PUSH"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setResult(r)}
              className={`py-2.5 rounded-lg text-sm font-medium transition-colors ${
                result === r
                  ? r === "WIN"
                    ? "bg-green-600 text-white"
                    : r === "LOSS"
                    ? "bg-red-600 text-white"
                    : "bg-gray-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {result === "WIN" && (
        <div>
          <label className="text-xs text-gray-500 mb-1 block">
            Payout (total return including stake)
          </label>
          <input
            type="number"
            value={payoutCashUnits}
            onChange={(e) => setPayoutCashUnits(e.target.value)}
            placeholder="e.g. 191"
            min="0"
            className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      {/* Profit Preview */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Stake</span>
          <span className="text-white">{stakeCashUnits} units</span>
        </div>
        <div className="flex justify-between text-sm mt-2">
          <span className="text-gray-400">Payout</span>
          <span className="text-white">{payout} units</span>
        </div>
        <div className="border-t border-gray-800 mt-2 pt-2 flex justify-between text-sm">
          <span className="text-gray-400 font-medium">Profit</span>
          <span
            className={`font-bold ${
              profit > 0
                ? "text-green-400"
                : profit < 0
                ? "text-red-400"
                : "text-gray-400"
            }`}
          >
            {profit >= 0 ? "+" : ""}
            {profit} units
          </span>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || (result === "WIN" && !payoutCashUnits)}
        className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors"
      >
        {loading ? "Settling..." : "Confirm Settlement"}
      </button>
    </form>
  );
}
