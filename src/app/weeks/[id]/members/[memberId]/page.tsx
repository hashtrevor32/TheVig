import { prisma } from "@/lib/prisma";
import { requireWeekAccess } from "@/lib/auth";
import { getCreditInfo } from "@/lib/credit";
import { notFound } from "next/navigation";
import Link from "next/link";
import { MemberBets } from "./member-bets";
import type { LossRebateRule } from "@/lib/promo-engine";

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

  // Fetch active promos and compute this member's progress
  const promos = await prisma.promo.findMany({
    where: { weekId: id, active: true },
    orderBy: { createdAt: "desc" },
  });

  const promoProgress = promos.map((p) => {
    const rule = p.ruleJson as unknown as LossRebateRule;
    const windowStart = new Date(rule.windowStart);
    const windowEnd = new Date(rule.windowEnd);

    const eligibleBets = bets.filter((b) => {
      const placed = new Date(b.placedAt);
      if (placed < windowStart || placed > windowEnd) return false;
      if (rule.oddsMin != null && b.oddsAmerican < rule.oddsMin) return false;
      if (rule.oddsMax != null && b.oddsAmerican > rule.oddsMax) return false;
      if (b.stakeCashUnits <= 0) return false;
      return true;
    });

    const eligibleHandle = eligibleBets.reduce(
      (s, b) => s + b.stakeCashUnits,
      0
    );
    const eligibleLosingStake = eligibleBets
      .filter((b) => b.result === "LOSS")
      .reduce((s, b) => s + b.stakeCashUnits, 0);
    const handleProgress =
      rule.minHandleUnits > 0
        ? Math.min(100, (eligibleHandle / rule.minHandleUnits) * 100)
        : 100;
    const qualified = handleProgress >= 100 && eligibleLosingStake > 0;

    const projectedAward = qualified
      ? Math.min(
          rule.capUnits,
          Math.floor((eligibleLosingStake * rule.percentBack) / 100)
        )
      : 0;

    return {
      promoId: p.id,
      promoName: p.name,
      percentBack: rule.percentBack,
      capUnits: rule.capUnits,
      minHandle: rule.minHandleUnits,
      currentHandle: eligibleHandle,
      handleProgress,
      qualified,
      eligibleBetsCount: eligibleBets.length,
      eligibleLosingStake,
      projectedAward,
    };
  });

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

      {/* Promo Progress */}
      {promoProgress.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-purple-400 uppercase tracking-wide mb-3">
            Promo Progress
          </h3>
          <div className="space-y-2">
            {promoProgress.map((pp) => (
              <Link
                key={pp.promoId}
                href={`/weeks/${id}/promos/${pp.promoId}`}
                className={`block bg-gray-900 rounded-xl border p-4 space-y-2 hover:border-gray-600 transition-colors ${
                  pp.qualified
                    ? "border-green-500/30"
                    : "border-gray-800"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {pp.qualified ? (
                      <svg
                        className="w-4 h-4 text-green-400 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : (
                      <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                      </div>
                    )}
                    <span className="text-white text-sm font-medium">
                      {pp.promoName}
                    </span>
                  </div>
                  {pp.qualified ? (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400">
                      Qualified
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-700 text-gray-400">
                      {Math.round(pp.handleProgress)}%
                    </span>
                  )}
                </div>

                {/* Handle Progress Bar */}
                {pp.minHandle > 0 && (
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>
                        {pp.currentHandle} / {pp.minHandle} min handle
                      </span>
                      <span>
                        {pp.eligibleBetsCount} eligible bets
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          pp.qualified ? "bg-green-500" : "bg-yellow-500/60"
                        }`}
                        style={{
                          width: `${Math.min(pp.handleProgress, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Award details */}
                <div className="flex gap-4 text-xs text-gray-500">
                  <span>{pp.percentBack}% back</span>
                  {pp.eligibleLosingStake > 0 && (
                    <span>
                      Losing: {pp.eligibleLosingStake} units
                    </span>
                  )}
                  {pp.qualified && pp.projectedAward > 0 && (
                    <span className="text-blue-400">
                      Award: {pp.projectedAward} FP
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

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
