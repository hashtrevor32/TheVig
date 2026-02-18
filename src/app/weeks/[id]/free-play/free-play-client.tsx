"use client";

import { useState } from "react";
import { createFreePlayAward, voidFreePlayAward } from "@/lib/actions";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

type Award = {
  id: string;
  memberId: string;
  member: { name: string };
  amountUnits: number;
  source: string;
  status: string;
  notes: string | null;
  createdAt: Date;
};

type Member = { id: string; name: string; freePlayBalance: number };

export function FreePlayClient({
  weekId,
  members,
  awards,
  weekStatus,
}: {
  weekId: string;
  members: Member[];
  awards: Award[];
  weekStatus: string;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!memberId || !amount) return;
    setLoading(true);
    await createFreePlayAward({
      weekId,
      memberId,
      amountUnits: parseInt(amount),
      notes: notes || undefined,
    });
    setMemberId("");
    setAmount("");
    setNotes("");
    setShowAdd(false);
    setLoading(false);
    router.refresh();
  }

  async function handleVoid(awardId: string) {
    await voidFreePlayAward(awardId);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Add Form */}
      {weekStatus === "OPEN" && (
        showAdd ? (
          <form
            onSubmit={handleAdd}
            className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold text-sm">Add Award</h3>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="text-gray-400"
              >
                <X size={18} />
              </button>
            </div>
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select member...</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.freePlayBalance} FP)
                </option>
              ))}
            </select>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount (units)"
              min="1"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={loading || !memberId || !amount}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white font-medium rounded text-sm"
            >
              {loading ? "Adding..." : "Add Award"}
            </button>
          </form>
        ) : (
          <button
            onClick={() => setShowAdd(true)}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg flex items-center justify-center gap-2"
          >
            <Plus size={18} />
            Add Free Play Award
          </button>
        )
      )}

      {/* Awards List */}
      {awards.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
          <p className="text-gray-400">No free play awards yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {awards.map((a) => (
            <div
              key={a.id}
              className={`bg-gray-900 rounded-lg border border-gray-800 p-3 ${
                a.status === "VOIDED" ? "opacity-50" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-medium text-sm">
                    {a.member.name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-blue-400 text-sm font-semibold">
                      +{a.amountUnits} units
                    </span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        a.source === "PROMO"
                          ? "bg-purple-500/10 text-purple-400"
                          : a.source === "DEFAULT_REBATE"
                          ? "bg-green-500/10 text-green-400"
                          : "bg-gray-700 text-gray-400"
                      }`}
                    >
                      {a.source === "DEFAULT_REBATE" ? "30% REBATE" : a.source}
                    </span>
                    {a.status === "VOIDED" && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">
                        VOIDED
                      </span>
                    )}
                  </div>
                  {a.notes && (
                    <p className="text-xs text-gray-500 mt-1">{a.notes}</p>
                  )}
                </div>
                {a.status === "EARNED" && weekStatus === "OPEN" && (
                  <button
                    onClick={() => handleVoid(a.id)}
                    className="text-xs text-red-400 hover:text-red-300 px-2 py-1"
                  >
                    Void
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
