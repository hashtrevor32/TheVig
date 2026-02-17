"use client";

import { useState } from "react";
import { quickSettle } from "@/lib/actions";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Bet = {
  id: string;
  memberId: string;
  member: { name: string };
  description: string;
  eventKey: string | null;
  oddsAmerican: number;
  stakeCashUnits: number;
  status: string;
  result: string | null;
  payoutCashUnits: number | null;
  placedAt: Date;
};

export function BetsList({
  bets,
  weekId,
  weekStatus,
}: {
  bets: Bet[];
  weekId: string;
  weekStatus: string;
}) {
  const openBets = bets.filter((b) => b.status === "OPEN");
  const settledBets = bets.filter((b) => b.status === "SETTLED");

  return (
    <div className="space-y-6">
      {openBets.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-yellow-400 uppercase tracking-wide mb-3">
            Open ({openBets.length})
          </h3>
          <div className="space-y-2">
            {openBets.map((bet) => (
              <OpenBetCard
                key={bet.id}
                bet={bet}
                weekId={weekId}
                weekStatus={weekStatus}
              />
            ))}
          </div>
        </div>
      )}

      {settledBets.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
            Settled ({settledBets.length})
          </h3>
          <div className="space-y-2">
            {settledBets.map((bet) => (
              <SettledBetCard key={bet.id} bet={bet} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OpenBetCard({
  bet,
  weekId,
  weekStatus,
}: {
  bet: Bet;
  weekId: string;
  weekStatus: string;
}) {
  const [settling, setSettling] = useState(false);
  const router = useRouter();

  async function handleQuickSettle(result: "LOSS" | "PUSH") {
    setSettling(true);
    await quickSettle(bet.id, result);
    router.refresh();
    setSettling(false);
  }

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium text-sm truncate">
            {bet.description}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-500">{bet.member.name}</span>
            <span className="text-xs text-gray-600">·</span>
            <span className="text-xs text-gray-500">
              {bet.oddsAmerican > 0 ? "+" : ""}
              {bet.oddsAmerican}
            </span>
            <span className="text-xs text-gray-600">·</span>
            <span className="text-xs text-gray-500">
              {bet.stakeCashUnits} units
            </span>
          </div>
        </div>
        <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-400 rounded text-xs font-medium shrink-0">
          OPEN
        </span>
      </div>

      {weekStatus === "OPEN" && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => handleQuickSettle("LOSS")}
            disabled={settling}
            className="flex-1 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium rounded transition-colors"
          >
            Loss
          </button>
          <button
            onClick={() => handleQuickSettle("PUSH")}
            disabled={settling}
            className="flex-1 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium rounded transition-colors"
          >
            Push
          </button>
          <Link
            href={`/weeks/${weekId}/bets/${bet.id}/settle`}
            className="flex-1 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 text-xs font-medium rounded text-center transition-colors"
          >
            Win
          </Link>
        </div>
      )}
    </div>
  );
}

function SettledBetCard({ bet }: { bet: Bet }) {
  const profit = (bet.payoutCashUnits ?? 0) - bet.stakeCashUnits;

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium text-sm truncate">
            {bet.description}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-500">{bet.member.name}</span>
            <span className="text-xs text-gray-600">·</span>
            <span className="text-xs text-gray-500">
              {bet.oddsAmerican > 0 ? "+" : ""}
              {bet.oddsAmerican}
            </span>
            <span className="text-xs text-gray-600">·</span>
            <span className="text-xs text-gray-500">
              {bet.stakeCashUnits} units
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <span
            className={`px-2 py-0.5 rounded text-xs font-medium ${
              bet.result === "WIN"
                ? "bg-green-500/10 text-green-400"
                : bet.result === "LOSS"
                ? "bg-red-500/10 text-red-400"
                : "bg-gray-700 text-gray-400"
            }`}
          >
            {bet.result}
          </span>
          <p
            className={`text-xs mt-1 font-medium ${
              profit > 0
                ? "text-green-400"
                : profit < 0
                ? "text-red-400"
                : "text-gray-400"
            }`}
          >
            {profit >= 0 ? "+" : ""}
            {profit} units
          </p>
        </div>
      </div>
    </div>
  );
}
