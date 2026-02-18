"use client";

import { useState } from "react";
import { updateCreditLimit, setFreePlayBalance } from "@/lib/actions";
import { useRouter } from "next/navigation";
import Link from "next/link";

type MemberStat = {
  memberId: string;
  memberName: string;
  creditLimit: number;
  openExposure: number;
  availableCredit: number;
  openBetsCount: number;
  cashPL: number;
  freePlay: number;
  freePlayBalance: number;
};

export function MemberCards({
  memberStats,
  weekId,
  weekStatus,
}: {
  memberStats: MemberStat[];
  weekId: string;
  weekStatus: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
        Members ({memberStats.length})
      </h3>
      <div className="space-y-3">
        {memberStats.map((ms) => (
          <MemberCard
            key={ms.memberId}
            ms={ms}
            weekId={weekId}
            weekStatus={weekStatus}
          />
        ))}
      </div>
    </div>
  );
}

function MemberCard({
  ms,
  weekId,
  weekStatus,
}: {
  ms: MemberStat;
  weekId: string;
  weekStatus: string;
}) {
  const [editing, setEditing] = useState(false);
  const [limitValue, setLimitValue] = useState(String(ms.creditLimit));
  const [editingFP, setEditingFP] = useState(false);
  const [fpValue, setFpValue] = useState(String(ms.freePlayBalance));
  const [saving, setSaving] = useState(false);
  const [savingFP, setSavingFP] = useState(false);
  const router = useRouter();

  const pct =
    ms.creditLimit > 0 ? (ms.openExposure / ms.creditLimit) * 100 : 0;
  const barColor =
    pct < 50 ? "bg-green-500" : pct < 80 ? "bg-yellow-500" : "bg-red-500";

  async function handleSave() {
    setSaving(true);
    try {
      await updateCreditLimit(weekId, ms.memberId, parseInt(limitValue) || 0);
      setEditing(false);
      router.refresh();
    } catch {
      setSaving(false);
    }
  }

  function handleCancel() {
    setLimitValue(String(ms.creditLimit));
    setEditing(false);
  }

  async function handleSaveFP() {
    setSavingFP(true);
    try {
      await setFreePlayBalance(ms.memberId, parseInt(fpValue) || 0);
      setEditingFP(false);
      router.refresh();
    } catch {
      setSavingFP(false);
    }
  }

  function handleCancelFP() {
    setFpValue(String(ms.freePlayBalance));
    setEditingFP(false);
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-3">
      <Link
        href={`/weeks/${weekId}/members/${ms.memberId}`}
        className="flex items-center justify-between hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center text-sm font-bold text-white">
            {ms.memberName[0]}
          </div>
          <span className="text-white font-medium">{ms.memberName}</span>
        </div>
        <div className="text-right">
          <p
            className={`text-sm font-semibold ${
              ms.cashPL > 0
                ? "text-green-400"
                : ms.cashPL < 0
                ? "text-red-400"
                : "text-gray-400"
            }`}
          >
            {ms.cashPL >= 0 ? "+" : ""}
            {ms.cashPL} units
          </p>
          {ms.freePlay > 0 && (
            <p className="text-xs text-blue-400">+{ms.freePlay} free play</p>
          )}
        </div>
      </Link>

      {/* Credit Meter */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={limitValue}
                onChange={(e) => setLimitValue(e.target.value)}
                className="w-20 px-2 py-0.5 bg-gray-800 border border-gray-600 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                min="0"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") handleCancel();
                }}
              />
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-green-400 hover:text-green-300 text-xs font-medium"
              >
                {saving ? "..." : "Save"}
              </button>
              <button
                onClick={handleCancel}
                className="text-gray-400 hover:text-white text-xs"
              >
                Cancel
              </button>
            </div>
          ) : (
            <span
              className={weekStatus === "OPEN" ? "cursor-pointer hover:text-gray-300" : ""}
              onClick={() => weekStatus === "OPEN" && setEditing(true)}
            >
              {ms.openExposure} / {ms.creditLimit} used
              {weekStatus === "OPEN" && (
                <span className="ml-1 text-blue-400/60">&#9998;</span>
              )}
            </span>
          )}
          <span>{ms.availableCredit} available</span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${barColor} rounded-full transition-all`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </div>

      {/* FP Balance */}
      <div className="flex justify-between text-xs text-gray-500">
        {editingFP ? (
          <div className="flex items-center gap-2">
            <span className="text-blue-400">FP:</span>
            <input
              type="number"
              value={fpValue}
              onChange={(e) => setFpValue(e.target.value)}
              className="w-20 px-2 py-0.5 bg-gray-800 border border-gray-600 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              min="0"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveFP();
                if (e.key === "Escape") handleCancelFP();
              }}
            />
            <button
              onClick={handleSaveFP}
              disabled={savingFP}
              className="text-green-400 hover:text-green-300 text-xs font-medium"
            >
              {savingFP ? "..." : "Save"}
            </button>
            <button
              onClick={handleCancelFP}
              className="text-gray-400 hover:text-white text-xs"
            >
              Cancel
            </button>
          </div>
        ) : (
          <span
            className={weekStatus === "OPEN" ? "cursor-pointer hover:text-gray-300" : ""}
            onClick={() => weekStatus === "OPEN" && setEditingFP(true)}
          >
            <span className="text-blue-400">FP Balance: {ms.freePlayBalance}</span>
            {weekStatus === "OPEN" && (
              <span className="ml-1 text-blue-400/60">&#9998;</span>
            )}
          </span>
        )}
      </div>

      <Link
        href={`/weeks/${weekId}/members/${ms.memberId}`}
        className="flex items-center justify-between text-xs text-gray-500 hover:text-gray-300 transition-colors"
      >
        <span>{ms.openBetsCount} open bets</span>
        <span className="text-gray-600">&rarr;</span>
      </Link>
    </div>
  );
}
