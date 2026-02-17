"use client";

import { useState } from "react";
import { closeWeek } from "@/lib/actions";
import { useRouter } from "next/navigation";

export function CloseWeekButton({
  weekId,
  canClose,
}: {
  weekId: string;
  canClose: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleClose() {
    setLoading(true);
    setError("");
    try {
      await closeWeek(weekId);
      router.push(`/weeks/${weekId}/results`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close week");
      setLoading(false);
    }
  }

  if (!canClose) {
    return (
      <button
        disabled
        className="w-full py-3 bg-gray-800 text-gray-500 font-medium rounded-lg cursor-not-allowed"
      >
        Settle all bets to close
      </button>
    );
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
      >
        Close Week
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-yellow-400 text-sm text-center">
        Are you sure? This will generate final statements and cannot be undone.
      </p>
      {error && <p className="text-red-400 text-sm text-center">{error}</p>}
      <div className="flex gap-3">
        <button
          onClick={() => setConfirming(false)}
          className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg"
        >
          Cancel
        </button>
        <button
          onClick={handleClose}
          disabled={loading}
          className="flex-1 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white font-medium rounded-lg"
        >
          {loading ? "Closing..." : "Confirm Close"}
        </button>
      </div>
    </div>
  );
}
