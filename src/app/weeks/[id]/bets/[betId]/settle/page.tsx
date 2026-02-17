import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { SettleForm } from "./settle-form";

export default async function SettleBetPage({
  params,
}: {
  params: Promise<{ id: string; betId: string }>;
}) {
  const { id, betId } = await params;

  const bet = await prisma.bet.findUnique({
    where: { id: betId },
    include: { member: true, week: true },
  });

  if (!bet || bet.weekId !== id || bet.status !== "OPEN") notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/weeks/${id}/bets`}
          className="text-gray-500 text-xs hover:text-gray-300"
        >
          ← Bets
        </Link>
        <h2 className="text-2xl font-bold text-white">Settle Bet</h2>
      </div>

      {/* Bet Details */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-2">
        <p className="text-white font-semibold">{bet.description}</p>
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <span>{bet.member.name}</span>
          <span>
            {bet.oddsAmerican > 0 ? "+" : ""}
            {bet.oddsAmerican}
          </span>
          <span>{bet.stakeCashUnits} units</span>
        </div>
      </div>

      <SettleForm
        betId={betId}
        weekId={id}
        stakeCashUnits={bet.stakeCashUnits}
      />
    </div>
  );
}
