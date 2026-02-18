import { prisma } from "./prisma";

const DEFAULT_LOSS_REBATE_PERCENT = 30;

export async function generateDefaultRebates(weekId: string) {
  const weekMembers = await prisma.weekMember.findMany({
    where: { weekId },
    include: { member: true },
  });

  for (const wm of weekMembers) {
    // Calculate net cash P/L from settled bets
    const bets = await prisma.bet.findMany({
      where: { weekId, memberId: wm.memberId, status: "SETTLED" },
    });

    const cashProfitUnits = bets.reduce(
      (sum, b) => sum + ((b.payoutCashUnits ?? 0) - b.stakeCashUnits),
      0
    );

    // Only losing weeks get the default rebate
    if (cashProfitUnits >= 0) continue;

    const cashLoss = Math.abs(cashProfitUnits);
    const defaultRebate = Math.floor(
      (cashLoss * DEFAULT_LOSS_REBATE_PERCENT) / 100
    );

    if (defaultRebate <= 0) continue;

    // Sum existing promo FP awards for this member+week
    const promoAwards = await prisma.freePlayAward.findMany({
      where: { weekId, memberId: wm.memberId, source: "PROMO", status: "EARNED" },
    });
    const totalPromoFP = promoAwards.reduce((s, a) => s + a.amountUnits, 0);

    // Only create a top-up if the default exceeds the promo amount
    if (defaultRebate <= totalPromoFP) continue;

    const topUp = defaultRebate - totalPromoFP;

    // Idempotent: check for existing default rebate award
    const existing = await prisma.freePlayAward.findFirst({
      where: { weekId, memberId: wm.memberId, source: "DEFAULT_REBATE" },
    });

    if (!existing) {
      await prisma.freePlayAward.create({
        data: {
          weekId,
          memberId: wm.memberId,
          source: "DEFAULT_REBATE",
          amountUnits: topUp,
          notes: `30% rebate: ${cashLoss} loss × ${DEFAULT_LOSS_REBATE_PERCENT}% = ${defaultRebate} FP${totalPromoFP > 0 ? ` (promo: ${totalPromoFP}, top-up: ${topUp})` : ""}`,
        },
      });
    }
  }
}

export async function updateFreePlayBalances(weekId: string) {
  const awards = await prisma.freePlayAward.findMany({
    where: { weekId, status: "EARNED" },
  });

  // Group by member
  const memberTotals = new Map<string, number>();
  for (const a of awards) {
    memberTotals.set(a.memberId, (memberTotals.get(a.memberId) ?? 0) + a.amountUnits);
  }

  for (const [memberId, total] of memberTotals) {
    await prisma.member.update({
      where: { id: memberId },
      data: { freePlayBalance: { increment: total } },
    });
  }
}

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
