import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { WeekDashboardClient } from "./week-dashboard-client";
import type { LossRebateRule } from "@/lib/promo-engine";

export default async function WeekDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const week = await prisma.week.findUnique({
    where: { id },
    include: {
      weekMembers: {
        include: { member: true },
      },
      bets: true,
      freePlayAwards: true,
      promos: { where: { active: true }, orderBy: { createdAt: "desc" } },
    },
  });

  if (!week) notFound();

  const allMembers = await prisma.member.findMany({
    orderBy: { name: "asc" },
  });

  const memberIds = week.weekMembers.map((wm) => wm.memberId);
  const availableMembers = allMembers.filter(
    (m) => !memberIds.includes(m.id)
  );

  // Compute per-member stats
  const memberStats = week.weekMembers.map((wm) => {
    const memberBets = week.bets.filter((b) => b.memberId === wm.memberId);
    const openBets = memberBets.filter((b) => b.status === "OPEN");
    const settledBets = memberBets.filter((b) => b.status === "SETTLED");
    const openExposure = openBets.reduce((s, b) => s + b.stakeCashUnits, 0);
    const cashPL = settledBets.reduce(
      (s, b) => s + ((b.payoutCashUnits ?? 0) - b.stakeCashUnits),
      0
    );
    const freePlay = week.freePlayAwards
      .filter((a) => a.memberId === wm.memberId && a.status === "EARNED")
      .reduce((s, a) => s + a.amountUnits, 0);

    return {
      memberId: wm.memberId,
      memberName: wm.member.name,
      creditLimit: wm.creditLimitUnits,
      openExposure,
      availableCredit: wm.creditLimitUnits - openExposure,
      openBetsCount: openBets.length,
      cashPL,
      freePlay,
    };
  });

  const totalBets = week.bets.length;
  const openBetsCount = week.bets.filter((b) => b.status === "OPEN").length;
  const settledBetsCount = totalBets - openBetsCount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/weeks"
            className="text-gray-500 text-xs hover:text-gray-300"
          >
            ← Weeks
          </Link>
          <h2 className="text-2xl font-bold text-white">{week.name}</h2>
          <p className="text-gray-500 text-xs">
            {new Date(week.startAt).toLocaleDateString()} –{" "}
            {new Date(week.endAt).toLocaleDateString()}
          </p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-sm font-medium ${
            week.status === "OPEN"
              ? "bg-green-500/10 text-green-400"
              : "bg-gray-700 text-gray-400"
          }`}
        >
          {week.status}
        </span>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-3 text-center">
          <p className="text-gray-500 text-xs">Total</p>
          <p className="text-xl font-bold text-white">{totalBets}</p>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-3 text-center">
          <p className="text-gray-500 text-xs">Open</p>
          <p className="text-xl font-bold text-yellow-400">{openBetsCount}</p>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-3 text-center">
          <p className="text-gray-500 text-xs">Settled</p>
          <p className="text-xl font-bold text-green-400">{settledBetsCount}</p>
        </div>
      </div>

      {/* Action Buttons */}
      {week.status === "OPEN" && (
        <div className="grid grid-cols-2 gap-3">
          <Link
            href={`/weeks/${id}/bets/new`}
            className="py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-center text-sm transition-colors"
          >
            Add Bet
          </Link>
          <Link
            href={`/weeks/${id}/bets`}
            className="py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg text-center text-sm transition-colors"
          >
            View Bets
          </Link>
          <Link
            href={`/weeks/${id}/free-play`}
            className="py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg text-center text-sm transition-colors"
          >
            Free Play
          </Link>
          <Link
            href={`/weeks/${id}/promos`}
            className="py-2.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 font-medium rounded-lg text-center text-sm transition-colors border border-purple-500/20"
          >
            Promos{week.promos.length > 0 ? ` (${week.promos.length})` : ""}
          </Link>
          {openBetsCount === 0 && totalBets > 0 ? (
            <Link
              href={`/weeks/${id}/close`}
              className="col-span-2 py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg text-center text-sm transition-colors"
            >
              Close Week
            </Link>
          ) : (
            <Link
              href={`/weeks/${id}/close`}
              className="col-span-2 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-400 font-medium rounded-lg text-center text-sm transition-colors"
            >
              Close Week
            </Link>
          )}
        </div>
      )}

      {week.status === "CLOSED" && (
        <Link
          href={`/weeks/${id}/results`}
          className="block w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-center transition-colors"
        >
          View Results
        </Link>
      )}

      {/* Member Cards */}
      <div>
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
          Members ({memberStats.length})
        </h3>
        <div className="space-y-3">
          {memberStats.map((ms) => {
            const pct =
              ms.creditLimit > 0
                ? (ms.openExposure / ms.creditLimit) * 100
                : 0;
            const barColor =
              pct < 50
                ? "bg-green-500"
                : pct < 80
                ? "bg-yellow-500"
                : "bg-red-500";

            return (
              <div
                key={ms.memberId}
                className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center text-sm font-bold text-white">
                      {ms.memberName[0]}
                    </div>
                    <span className="text-white font-medium">
                      {ms.memberName}
                    </span>
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
                      <p className="text-xs text-blue-400">
                        +{ms.freePlay} free play
                      </p>
                    )}
                  </div>
                </div>

                {/* Credit Meter */}
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>
                      {ms.openExposure} / {ms.creditLimit} used
                    </span>
                    <span>{ms.availableCredit} available</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${barColor} rounded-full transition-all`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="flex gap-2 text-xs text-gray-500">
                  <span>{ms.openBetsCount} open bets</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Promos */}
      {week.promos.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
            Active Promos
          </h3>
          <div className="space-y-2">
            {week.promos.map((p) => {
              const rule = p.ruleJson as unknown as LossRebateRule;
              return (
                <Link
                  key={p.id}
                  href={`/weeks/${id}/promos/${p.id}`}
                  className="block bg-gray-900 rounded-xl border border-gray-800 p-3 hover:border-gray-600 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white text-sm font-medium">{p.name}</p>
                      <p className="text-gray-500 text-xs">
                        {rule.percentBack}% back &middot; Min {rule.minHandleUnits} units &middot; Cap {rule.capUnits}
                      </p>
                    </div>
                    <span className="text-purple-400 text-xs">Progress &rarr;</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Member to Week */}
      {week.status === "OPEN" && (
        <WeekDashboardClient
          weekId={id}
          availableMembers={availableMembers}
        />
      )}
    </div>
  );
}
