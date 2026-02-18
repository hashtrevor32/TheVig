import { prisma } from "@/lib/prisma";
import { requireWeekAccess } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { AddBetForm } from "./add-bet-form";

export default async function AddBetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireWeekAccess(id);

  const week = await prisma.week.findUnique({
    where: { id },
    include: {
      weekMembers: {
        include: { member: { select: { id: true, name: true, freePlayBalance: true } } },
      },
      bets: true,
    },
  });

  if (!week || week.status !== "OPEN") notFound();

  const openBets = week.bets.filter((b) => b.status === "OPEN");
  const nonVoidedBets = week.bets.filter((b) => b.status !== "VOIDED");

  const membersWithCredit = week.weekMembers.map((wm) => {
    const openExposure = openBets
      .filter((b) => b.memberId === wm.memberId)
      .reduce((s, b) => s + b.stakeCashUnits, 0);

    return {
      id: wm.memberId,
      name: wm.member.name,
      creditLimit: wm.creditLimitUnits,
      openExposure,
      availableCredit: wm.creditLimitUnits - openExposure,
      freePlayBalance: wm.member.freePlayBalance,
    };
  });

  // Build existing bets per member for duplicate detection on scan
  const existingBetsByMember: Record<string, {
    description: string;
    oddsAmerican: number;
    stakeCashUnits: number;
    stakeFreePlayUnits: number;
    placedAt: string;
  }[]> = {};
  for (const bet of nonVoidedBets) {
    if (!existingBetsByMember[bet.memberId]) {
      existingBetsByMember[bet.memberId] = [];
    }
    existingBetsByMember[bet.memberId].push({
      description: bet.description,
      oddsAmerican: bet.oddsAmerican,
      stakeCashUnits: bet.stakeCashUnits,
      stakeFreePlayUnits: bet.stakeFreePlayUnits,
      placedAt: bet.placedAt.toISOString(),
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/weeks/${id}`}
          className="text-gray-500 text-xs hover:text-gray-300"
        >
          ← {week.name}
        </Link>
        <h2 className="text-2xl font-bold text-white">Add Bet</h2>
      </div>
      <AddBetForm
        weekId={id}
        members={membersWithCredit}
        existingBetsByMember={existingBetsByMember}
      />
    </div>
  );
}
