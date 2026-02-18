import { prisma } from "@/lib/prisma";
import { requireWeekAccess, getGroupId } from "@/lib/auth";
import Link from "next/link";
import { WeekDashboardClient } from "./week-dashboard-client";
import { MemberCards } from "./member-cards";
import { type LossRebateRule, matchesPromoFilter } from "@/lib/promo-engine";

export default async function WeekDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireWeekAccess(id);
  const groupId = await getGroupId();

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

  if (!week) return null;

  const allMembers = await prisma.member.findMany({
    where: { groupId },
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

    // Compute promo progress for each active promo
    const promoProgress = week.promos.map((p) => {
      const rule = p.ruleJson as unknown as LossRebateRule;
      const windowStart = new Date(rule.windowStart);
      const windowEnd = new Date(rule.windowEnd);

      const eligibleBets = memberBets.filter((b) => {
        const placed = new Date(b.placedAt);
        if (placed < windowStart || placed > windowEnd) return false;
        if (rule.oddsMin != null && b.oddsAmerican < rule.oddsMin) return false;
        if (rule.oddsMax != null && b.oddsAmerican > rule.oddsMax) return false;
        if (b.stakeCashUnits <= 0) return false;
        if (!matchesPromoFilter(b, rule)) return false;
        return true;
      });

      const eligibleHandle = eligibleBets.reduce(
        (s, b) => s + b.stakeCashUnits,
        0
      );
      const handleProgress =
        rule.minHandleUnits > 0
          ? Math.min(100, (eligibleHandle / rule.minHandleUnits) * 100)
          : 100;
      const qualified = handleProgress >= 100;

      return {
        promoId: p.id,
        promoName: p.name,
        minHandle: rule.minHandleUnits,
        currentHandle: eligibleHandle,
        handleProgress,
        qualified,
      };
    });

    return {
      memberId: wm.memberId,
      memberName: wm.member.name,
      creditLimit: wm.creditLimitUnits,
      openExposure,
      availableCredit: wm.creditLimitUnits - openExposure,
      openBetsCount: openBets.length,
      cashPL,
      freePlay,
      freePlayBalance: wm.member.freePlayBalance,
      promoProgress,
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
      <MemberCards
        memberStats={memberStats}
        weekId={id}
        weekStatus={week.status}
      />

      {/* Suggest Promos Card (OPEN weeks only) */}
      {week.status === "OPEN" && (
        <Link
          href={`/weeks/${id}/promos/new?suggest=true`}
          className="block bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-xl p-4 hover:border-purple-500/40 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-purple-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <p className="text-purple-300 font-medium text-sm">Suggest Promos</p>
                <p className="text-gray-500 text-xs">
                  AI analyzes this week&apos;s sports schedule
                </p>
              </div>
            </div>
            <span className="text-purple-400 text-xs">&rarr;</span>
          </div>
        </Link>
      )}

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
                        {(rule.sport || rule.betType) && (
                          <span className="text-purple-400"> &middot; {[rule.sport, rule.betType].filter(Boolean).join(" ")}</span>
                        )}
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
