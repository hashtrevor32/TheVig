"use client";

import { useState } from "react";
import { editBet, voidBet } from "@/lib/actions";
import { useRouter } from "next/navigation";

type BetData = {
  id: string;
  description: string;
  eventKey: string | null;
  oddsAmerican: number;
  stakeCashUnits: number;
  stakeFreePlayUnits: number;
};

export function EditBetForm({
  bet,
  weekId,
  memberName,
  availableCredit,
  freePlayBalance,
}: {
  bet: BetData;
  weekId: string;
  memberName: string;
  availableCredit: number;
  freePlayBalance: number;
}) {
  const [description, setDescription] = useState(bet.description);
  const [eventKey, setEventKey] = useState(bet.eventKey || "");
  const [odds, setOdds] = useState(String(bet.oddsAmerican));
  const [stake, setStake] = useState(String(bet.stakeCashUnits));
  const [freePlay, setFreePlay] = useState(String(bet.stakeFreePlayUnits));
  const [saving, setSaving] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await editBet({
        betId: bet.id,
        description,
        eventKey: eventKey || null,
        oddsAmerican: parseInt(odds) || 0,
        stakeCashUnits: parseInt(stake) || 0,
        stakeFreePlayUnits: parseInt(freePlay) || 0,
      });
      router.push(`/weeks/${weekId}/bets`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  }

  async function handleVoid() {
    setVoiding(true);
    try {
      await voidBet(bet.id);
      router.push(`/weeks/${weekId}/bets`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to void");
      setVoiding(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-3">
        <span className="text-gray-400 text-sm">Member: </span>
        <span className="text-white text-sm font-medium">{memberName}</span>
        <span className="text-gray-500 text-sm ml-3">
          Credit: {availableCredit} available
        </span>
        {freePlayBalance > 0 && (
          <span className="text-blue-400 text-sm ml-3">
            FP: {freePlayBalance}
          </span>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="text-xs text-gray-500 mb-1 block">Event Key</label>
          <input
            type="text"
            value={eventKey}
            onChange={(e) => setEventKey(e.target.value)}
            placeholder="e.g. chiefs-bills-feb17"
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Odds</label>
            <input
              type="number"
              value={odds}
              onChange={(e) => setOdds(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Stake</label>
            <input
              type="number"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              min="1"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Free Play</label>
            <input
              type="number"
              value={freePlay}
              onChange={(e) => setFreePlay(e.target.value)}
              min="0"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={saving || !description || !odds || !stake}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </form>

      <div className="border-t border-gray-800 pt-4">
        {confirmVoid ? (
          <div className="space-y-2">
            <p className="text-sm text-gray-400 text-center">
              Void this bet? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleVoid}
                disabled={voiding}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
              >
                {voiding ? "Voiding..." : "Confirm Void"}
              </button>
              <button
                onClick={() => setConfirmVoid(false)}
                className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmVoid(true)}
            className="w-full py-2.5 bg-red-600/10 hover:bg-red-600/20 text-red-400 font-medium rounded-lg transition-colors border border-red-500/20"
          >
            Void Bet
          </button>
        )}
      </div>
    </div>
  );
}
