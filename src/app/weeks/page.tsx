import { prisma } from "@/lib/prisma";
import { getGroupId } from "@/lib/auth";
import { WeekForm } from "./week-form";
import { WeeksListClient } from "./weeks-list-client";

export default async function WeeksPage() {
  const groupId = await getGroupId();
  const weeks = await prisma.week.findMany({
    where: { groupId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { bets: true, weekMembers: true } },
    },
  });

  const weekSummaries = weeks.map((w) => ({
    id: w.id,
    name: w.name,
    startAt: w.startAt.toISOString(),
    endAt: w.endAt.toISOString(),
    status: w.status,
    memberCount: w._count.weekMembers,
    betCount: w._count.bets,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Weeks</h2>
      </div>

      <WeekForm />

      <WeeksListClient weeks={weekSummaries} />
    </div>
  );
}
