import { prisma } from "@/lib/prisma";
import { getGroupId } from "@/lib/auth";
import Link from "next/link";
import { WeeklyReport } from "./weekly-report";

export default async function DashboardPage() {
  const groupId = await getGroupId();
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { members: true },
  });

  const openWeeks = await prisma.week.findMany({
    where: { groupId, status: "OPEN" },
    include: {
      _count: { select: { bets: true, weekMembers: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const totalBets = await prisma.bet.count({ where: { week: { groupId } } });
  const openBets = await prisma.bet.count({ where: { status: "OPEN", week: { groupId } } });
  const closedWeeks = await prisma.week.count({ where: { groupId, status: "CLOSED" } });

  // Fetch the most recently closed week for the weekly report
  const lastClosedWeek = await prisma.week.findFirst({
    where: { groupId, status: "CLOSED" },
    orderBy: { closedAt: "desc" },
    include: {
      weekStatements: {
        include: { member: true },
        orderBy: { weeklyScoreUnits: "desc" },
      },
      freePlayAwards: {
        where: { status: "EARNED" },
        include: { member: true },
      },
      bets: {
        where: { status: "SETTLED" },
      },
    },
  });

  // Build the report data
  let reportData: {
    weekId: string;
    weekName: string;
    closedAt: string;
    members: {
      name: string;
      cashPL: number;
      freePlayEarned: number;
      weeklyScore: number;
      owesHouse: number;
      houseOwes: number;
      freePlayOwed: number;
      totalBets: number;
      wins: number;
      losses: number;
    }[];
  } | null = null;

  if (lastClosedWeek && lastClosedWeek.weekStatements.length > 0) {
    const memberBetStats = new Map<string, { total: number; wins: number; losses: number }>();
    for (const bet of lastClosedWeek.bets) {
      const existing = memberBetStats.get(bet.memberId) || { total: 0, wins: 0, losses: 0 };
      existing.total++;
      if (bet.result === "WIN") existing.wins++;
      if (bet.result === "LOSS") existing.losses++;
      memberBetStats.set(bet.memberId, existing);
    }

    // Group FP awards by member for breakdown
    const fpByMember = new Map<string, number>();
    for (const award of lastClosedWeek.freePlayAwards) {
      fpByMember.set(award.memberId, (fpByMember.get(award.memberId) ?? 0) + award.amountUnits);
    }

    reportData = {
      weekId: lastClosedWeek.id,
      weekName: lastClosedWeek.name,
      closedAt: lastClosedWeek.closedAt?.toISOString() ?? "",
      members: lastClosedWeek.weekStatements.map((s) => {
        const betStats = memberBetStats.get(s.memberId) || { total: 0, wins: 0, losses: 0 };
        return {
          name: s.member.name,
          cashPL: s.cashProfitUnits,
          freePlayEarned: fpByMember.get(s.memberId) ?? s.freePlayEarnedUnits,
          weeklyScore: s.weeklyScoreUnits,
          owesHouse: s.owesHouseUnits,
          houseOwes: s.houseOwesUnits,
          freePlayOwed: s.houseOwesFreePlayUnits,
          totalBets: betStats.total,
          wins: betStats.wins,
          losses: betStats.losses,
        };
      }),
    };
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Dashboard</h2>
        <p className="text-gray-400 text-sm mt-1">
          Welcome to TheVig — your betting pool tracker
        </p>
      </div>

      {/* Weekly Report — shown first for Monday morning */}
      {reportData && <WeeklyReport report={reportData} />}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <p className="text-gray-500 text-xs uppercase tracking-wide">
            Open Weeks
          </p>
          <p className="text-2xl font-bold text-white mt-1">
            {openWeeks.length}
          </p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <p className="text-gray-500 text-xs uppercase tracking-wide">
            Open Bets
          </p>
          <p className="text-2xl font-bold text-yellow-400 mt-1">{openBets}</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <p className="text-gray-500 text-xs uppercase tracking-wide">
            Total Bets
          </p>
          <p className="text-2xl font-bold text-white mt-1">{totalBets}</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <p className="text-gray-500 text-xs uppercase tracking-wide">
            Closed Weeks
          </p>
          <p className="text-2xl font-bold text-white mt-1">{closedWeeks}</p>
        </div>
      </div>

      {/* Open Weeks */}
      {openWeeks.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
            Active Weeks
          </h3>
          <div className="space-y-2">
            {openWeeks.map((w) => (
              <Link
                key={w.id}
                href={`/weeks/${w.id}`}
                className="block bg-gray-900 rounded-xl border border-gray-800 p-4 hover:border-gray-600 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-semibold">{w.name}</h4>
                    <p className="text-gray-500 text-xs mt-0.5">
                      {w._count.weekMembers} members · {w._count.bets} bets
                    </p>
                  </div>
                  <span className="text-blue-400 text-xs">Open →</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Members */}
      {group && (
        <div>
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
            Members ({group.members.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {group.members.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 bg-gray-900 rounded-lg border border-gray-800 px-3 py-2"
              >
                <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-white">
                  {m.name[0]}
                </div>
                <span className="text-white text-sm">{m.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
