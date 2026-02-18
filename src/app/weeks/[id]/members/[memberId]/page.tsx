import { prisma } from "@/lib/prisma";
import { requireWeekAccess } from "@/lib/auth";
import { getCreditInfo } from "@/lib/credit";
import { notFound } from "next/navigation";
import Link from "next/link";
import { MemberBets } from "./member-bets";

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string; memberId: string }>;
}) {
  const { id, memberId } = await params;
  const week = await requireWeekAccess(id);

  const weekMember = await prisma.weekMember.findUnique({
    where: { weekId_memberId: { weekId: id, memberId } },
    include: { member: true },
  });

  if (!weekMember) notFound();

  const credit = await getCreditInfo(id, memberId);

  const bets = await prisma.bet.findMany({
    where: { weekId: id, memberId },
    include: { member: { select: { name: true } } },
    orderBy: { placedAt: "desc" },
  });

  // Compute cash P&L from settled bets
  const settledBets = bets.filter((b) => b.status === "SETTLED");
  const cashPL = settledBets.reduce(
    (s, b) => s + ((b.payoutCashUnits ?? 0) - b.stakeCashUnits),
    0
  );

  // Free play earned this week
  const fpAwards = await prisma.freePlayAward.findMany({
    where: { weekId: id, memberId, status: "EARNED" },
  });
  const freePlayEarned = fpAwards.reduce((s, a) => s + a.amountUnits, 0);

  // Serialize bets for client component
  const serializedBets = bets.map((b) => ({
    id: b.id,
    memberId: b.memberId,
    member: { name: b.member.name },
    description: b.description,
    eventKey: b.eventKey,
    oddsAmerican: b.oddsAmerican,
    stakeCashUnits: b.stakeCashUnits,
    stakeFreePlayUnits: b.stakeFreePlayUnits,
    status: b.status,
    result: b.result,
    payoutCashUnits: b.payoutCashUnits,
    placedAt: b.placedAt.toISOString(),
  }));

  const openCount = bets.filter((b) => b.status === "OPEN").length;
  const settledCount = settledBets.length;
  const voidedCount = bets.filter((b) => b.status === "VOIDED").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href={`/weeks/${id}`}
          className="text-gray-500 text-xs hover:text-gray-300"
        >
          &larr; {week.name}
        </Link>
        <div className="flex items-center gap-3 mt-1">
          <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-lg font-bold text-white">
            {weekMember.member.name[0]}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">
              {weekMember.member.name}
            </h2>
            <p className="text-gray-500 text-xs">
              {week.name} &middot;{" "}
              <span
                className={
                  week.status === "OPEN" ? "text-green-400" : "text-gray-400"
                }
              >
                {week.status}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
          <p className="text-gray-500 text-xs">Cash P&L</p>
          <p
            className={`text-xl font-bold ${
              cashPL > 0
                ? "text-green-400"
                : cashPL < 0
                ? "text-red-400"
                : "text-gray-400"
            }`}
          >
            {cashPL >= 0 ? "+" : ""}
            {cashPL}
          </p>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
          <p className="text-gray-500 text-xs">FP Balance</p>
          <p className="text-xl font-bold text-blue-400">
            {weekMember.member.freePlayBalance}
          </p>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
          <p className="text-gray-500 text-xs">Credit Used</p>
          <p className="text-xl font-bold text-white">
            {credit.openExposure}{" "}
            <span className="text-sm font-normal text-gray-500">
              / {credit.creditLimit}
            </span>
          </p>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
          <p className="text-gray-500 text-xs">Available</p>
          <p className="text-xl font-bold text-white">
            {credit.availableCredit}
          </p>
        </div>
      </div>

      {/* Bet Count Summary */}
      <div className="flex gap-4 text-xs text-gray-500">
        <span>
          {openCount} open
        </span>
        <span>
          {settledCount} settled
        </span>
        {voidedCount > 0 && (
          <span>
            {voidedCount} voided
          </span>
        )}
        {freePlayEarned > 0 && (
          <span className="text-blue-400">
            +{freePlayEarned} FP earned
          </span>
        )}
      </div>

      {/* Bets */}
      <MemberBets
        bets={serializedBets}
        weekId={id}
        weekStatus={week.status}
      />
    </div>
  );
}
