import { prisma } from "./prisma";

export async function getOpenExposure(weekId: string, memberId: string): Promise<number> {
  const result = await prisma.bet.aggregate({
    where: {
      weekId,
      memberId,
      status: "OPEN",
    },
    _sum: {
      stakeCashUnits: true,
    },
  });
  return result._sum.stakeCashUnits ?? 0;
}

export async function getCreditInfo(weekId: string, memberId: string) {
  const weekMember = await prisma.weekMember.findUnique({
    where: { weekId_memberId: { weekId, memberId } },
    include: { member: { select: { freePlayBalance: true } } },
  });

  if (!weekMember) {
    return { creditLimit: 0, openExposure: 0, availableCredit: 0, freePlayBalance: 0 };
  }

  const openExposure = await getOpenExposure(weekId, memberId);
  const availableCredit = weekMember.creditLimitUnits - openExposure;

  return {
    creditLimit: weekMember.creditLimitUnits,
    openExposure,
    availableCredit,
    freePlayBalance: weekMember.member.freePlayBalance,
  };
}

export function getCreditColor(used: number, total: number): string {
  if (total === 0) return "bg-gray-600";
  const pct = used / total;
  if (pct < 0.5) return "bg-green-500";
  if (pct < 0.8) return "bg-yellow-500";
  return "bg-red-500";
}
