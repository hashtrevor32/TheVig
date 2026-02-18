"use client";

import { useState } from "react";
import { togglePromo, deletePromo } from "@/lib/actions";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { LossRebateRule } from "@/lib/promo-engine";

type PromoItem = {
  id: string;
  name: string;
  type: string;
  ruleJson: unknown;
  active: boolean;
};

export function PromoListClient({
  promos,
  weekId,
  weekStatus,
}: {
  promos: PromoItem[];
  weekId: string;
  weekStatus: string;
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleToggle(promoId: string) {
    setLoadingId(promoId);
    setError("");
    try {
      await togglePromo(promoId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoadingId(null);
    }
  }

  async function handleDelete(promoId: string) {
    if (!confirm("Delete this promo?")) return;
    setLoadingId(promoId);
    setError("");
    try {
      await deletePromo(promoId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {promos.map((p) => {
        const rule = p.ruleJson as unknown as LossRebateRule;
        return (
          <div
            key={p.id}
            className={`bg-gray-900 rounded-xl border p-4 space-y-3 ${
              p.active ? "border-gray-800" : "border-gray-800/50 opacity-60"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium">{p.name}</p>
                <p className="text-gray-500 text-xs mt-0.5">
                  {rule.percentBack}% back on losses
                  {rule.eventKeyPattern && (
                    <span className="text-purple-400"> ({rule.eventKeyPattern})</span>
                  )}
                  {" "}&middot; Min {rule.minHandleUnits} units &middot; Cap {rule.capUnits} units
                </p>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  p.active
                    ? "bg-green-500/10 text-green-400"
                    : "bg-gray-700 text-gray-500"
                }`}
              >
                {p.active ? "Active" : "Inactive"}
              </span>
            </div>

            <div className="flex gap-2">
              <Link
                href={`/weeks/${weekId}/promos/${p.id}`}
                className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg text-center transition-colors"
              >
                Progress
              </Link>
              {weekStatus === "OPEN" && (
                <>
                  <button
                    onClick={() => handleToggle(p.id)}
                    disabled={loadingId === p.id}
                    className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 text-white"
                  >
                    {p.active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    disabled={loadingId === p.id}
                    className="py-2 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
