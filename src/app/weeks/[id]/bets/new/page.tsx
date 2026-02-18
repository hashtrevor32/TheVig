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
        include: { member: true },
      },
      bets: { where: { status: "OPEN" } },
    },
  });

  if (!week || week.status !== "OPEN") notFound();

  const membersWithCredit = week.weekMembers.map((wm) => {
    const openExposure = week.bets
      .filter((b) => b.memberId === wm.memberId)
      .reduce((s, b) => s + b.stakeCashUnits, 0);

    return {
      id: wm.memberId,
      name: wm.member.name,
      creditLimit: wm.creditLimitUnits,
      openExposure,
      availableCredit: wm.creditLimitUnits - openExposure,
    };
  });

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
      <AddBetForm weekId={id} members={membersWithCredit} />
    </div>
  );
}
