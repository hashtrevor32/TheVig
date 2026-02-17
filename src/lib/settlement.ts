import { prisma } from "./prisma";

export async function generateWeekStatements(weekId: string) {
  const weekMembers = await prisma.weekMember.findMany({
    where: { weekId },
    include: { member: true },
  });

  for (const wm of weekMembers) {
    const bets = await prisma.bet.findMany({
      where: { weekId, memberId: wm.memberId, status: "SETTLED" },
    });

    const cashProfitUnits = bets.reduce((sum, b) => {
      return sum + ((b.payoutCashUnits ?? 0) - b.stakeCashUnits);
    }, 0);

    const freePlayAwards = await prisma.freePlayAward.findMany({
      where: { weekId, memberId: wm.memberId, status: "EARNED" },
    });

    const freePlayEarnedUnits = freePlayAwards.reduce(
      (sum, a) => sum + a.amountUnits,
      0
    );

    const weeklyScoreUnits = cashProfitUnits + freePlayEarnedUnits;
    const owesHouseUnits = cashProfitUnits < 0 ? Math.abs(cashProfitUnits) : 0;
    const houseOwesUnits = cashProfitUnits > 0 ? cashProfitUnits : 0;
    const houseOwesFreePlayUnits = freePlayEarnedUnits;

    await prisma.weekStatement.upsert({
      where: { weekId_memberId: { weekId, memberId: wm.memberId } },
      update: {
        cashProfitUnits,
        freePlayEarnedUnits,
        weeklyScoreUnits,
        owesHouseUnits,
        houseOwesUnits,
        houseOwesFreePlayUnits,
      },
      create: {
        weekId,
        memberId: wm.memberId,
        cashProfitUnits,
        freePlayEarnedUnits,
        weeklyScoreUnits,
        owesHouseUnits,
        houseOwesUnits,
        houseOwesFreePlayUnits,
      },
    });
  }
}
