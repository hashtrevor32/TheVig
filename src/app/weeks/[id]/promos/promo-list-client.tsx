"use client";

import { useState } from "react";
import { togglePromo, deletePromo } from "@/lib/actions";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MessageSquare, Loader2, Copy, Check } from "lucide-react";
import type { LossRebateRule } from "@/lib/promo-types";

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
  weekName,
  weekStatus,
}: {
  promos: PromoItem[];
  weekId: string;
  weekName: string;
  weekStatus: string;
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Generated text message state
  const [generatedText, setGeneratedText] = useState("");
  const [generatingText, setGeneratingText] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleGenerateText() {
    setGeneratingText(true);
    setGeneratedText("");
    try {
      const promoData = promos
        .filter((p) => p.active)
        .map((p) => ({
          name: p.name,
          type: p.type,
          ruleJson: p.ruleJson,
        }));

      const res = await fetch("/api/generate-promo-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promos: promoData,
          weekName,
        }),
      });
      const data = await res.json();
      if (res.ok && data.text) {
        setGeneratedText(data.text);
      }
    } catch {
      // Non-critical
    } finally {
      setGeneratingText(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(generatedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = generatedText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

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

  const activePromos = promos.filter((p) => p.active);

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
                  {(rule.sport || rule.betType) && (
                    <span className="text-purple-400"> ({[rule.sport, rule.betType].filter(Boolean).join(" ")})</span>
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

      {/* Generate Group Text Button */}
      {activePromos.length > 0 && (
        <div className="pt-2">
          <button
            type="button"
            onClick={handleGenerateText}
            disabled={generatingText}
            className="w-full py-3 bg-gradient-to-r from-green-600/20 to-emerald-600/20 hover:from-green-600/30 hover:to-emerald-600/30 border border-green-500/20 text-green-400 font-medium rounded-lg flex items-center justify-center gap-2 transition-all text-sm"
          >
            {generatingText ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Generating announcement...
              </>
            ) : (
              <>
                <MessageSquare size={16} />
                Generate Group Text
              </>
            )}
          </button>
        </div>
      )}

      {/* Generated Text Display */}
      {generatedText && (
        <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="text-green-400" />
            <span className="text-sm font-medium text-green-300">
              Group Text Message
            </span>
          </div>
          <pre className="whitespace-pre-wrap text-gray-300 text-sm bg-gray-900/60 rounded-lg p-3 max-h-96 overflow-y-auto font-sans leading-relaxed">
            {generatedText}
          </pre>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-colors text-sm"
            >
              {copied ? (
                <>
                  <Check size={16} />
                  Copied!
                </>
              ) : (
                <>
                  <Copy size={16} />
                  Copy to Clipboard
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setGeneratedText("")}
              className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors text-sm"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
