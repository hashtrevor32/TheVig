import { prisma } from "@/lib/prisma";
import { requireWeekAccess } from "@/lib/auth";
import { getCreditInfo } from "@/lib/credit";
import { notFound } from "next/navigation";
import Link from "next/link";
import { EditBetForm } from "./edit-bet-form";

export default async function EditBetPage({
  params,
}: {
  params: Promise<{ id: string; betId: string }>;
}) {
  const { id, betId } = await params;
  await requireWeekAccess(id);

  const bet = await prisma.bet.findUnique({
    where: { id: betId },
    include: { member: true },
  });

  if (!bet || bet.weekId !== id || bet.status !== "OPEN") notFound();

  const credit = await getCreditInfo(id, bet.memberId);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/weeks/${id}/bets`}
          className="text-gray-500 text-xs hover:text-gray-300"
        >
          &larr; Bets
        </Link>
        <h2 className="text-2xl font-bold text-white">Edit Bet</h2>
      </div>
      <EditBetForm
        bet={{
          id: bet.id,
          description: bet.description,
          eventKey: bet.eventKey,
          oddsAmerican: bet.oddsAmerican,
          stakeCashUnits: bet.stakeCashUnits,
          stakeFreePlayUnits: bet.stakeFreePlayUnits,
        }}
        weekId={id}
        memberName={bet.member.name}
        availableCredit={credit.availableCredit + bet.stakeCashUnits}
      />
    </div>
  );
}
