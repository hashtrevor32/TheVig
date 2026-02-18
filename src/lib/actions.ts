"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { getCreditInfo } from "./credit";
import { generateWeekStatements, generateDefaultRebates, updateFreePlayBalances } from "./settlement";
import { generatePromoAwards } from "./promo-engine";
import { getGroupId, requireSession } from "./auth";

// Helper: verify a week belongs to the current operator's group
async function verifyWeekOwnership(weekId: string) {
  const groupId = await getGroupId();
  const week = await prisma.week.findUnique({ where: { id: weekId } });
  if (!week || week.groupId !== groupId) throw new Error("Week not found");
  return week;
}

// ── Members ──

export async function createMember(name: string) {
  const groupId = await getGroupId();
  const member = await prisma.member.create({ data: { name, groupId } });

  // Auto-add new member to all open weeks
  const openWeeks = await prisma.week.findMany({
    where: { groupId, status: "OPEN" },
  });
  if (openWeeks.length > 0) {
    await prisma.weekMember.createMany({
      data: openWeeks.map((w) => ({
        weekId: w.id,
        memberId: member.id,
        creditLimitUnits: 1000,
      })),
    });
  }

  revalidatePath("/members");
}

export async function updateMember(id: string, name: string) {
  const groupId = await getGroupId();
  const member = await prisma.member.findUnique({ where: { id } });
  if (!member || member.groupId !== groupId) throw new Error("Member not found");
  await prisma.member.update({ where: { id }, data: { name } });
  revalidatePath("/members");
}

// ── Weeks ──

export async function createWeek(data: {
  name: string;
  startAt: string;
  endAt: string;
}) {
  const groupId = await getGroupId();
  const week = await prisma.week.create({
    data: {
      groupId,
      name: data.name,
      startAt: new Date(data.startAt),
      endAt: new Date(data.endAt),
    },
  });

  // Auto-add all members to the new week
  const members = await prisma.member.findMany({
    where: { groupId },
  });
  if (members.length > 0) {
    await prisma.weekMember.createMany({
      data: members.map((m) => ({
        weekId: week.id,
        memberId: m.id,
        creditLimitUnits: 1000,
      })),
    });
  }

  revalidatePath("/weeks");
  return week.id;
}

export async function addMemberToWeek(
  weekId: string,
  memberId: string,
  creditLimit: number = 1000
) {
  await verifyWeekOwnership(weekId);
  await prisma.weekMember.create({
    data: { weekId, memberId, creditLimitUnits: creditLimit },
  });
  revalidatePath(`/weeks/${weekId}`);
}

export async function removeMemberFromWeek(weekId: string, memberId: string) {
  await verifyWeekOwnership(weekId);
  const openBets = await prisma.bet.count({
    where: { weekId, memberId, status: "OPEN" },
  });
  if (openBets > 0) {
    throw new Error("Cannot remove member with open bets");
  }
  await prisma.weekMember.delete({
    where: { weekId_memberId: { weekId, memberId } },
  });
  revalidatePath(`/weeks/${weekId}`);
}

// ── Bets ──

export async function createBet(data: {
  weekId: string;
  memberId: string;
  description: string;
  eventKey?: string;
  oddsAmerican: number;
  stakeCashUnits: number;
  stakeFreePlayUnits?: number;
  overrideCredit?: boolean;
  placedAt?: string;
}) {
  await verifyWeekOwnership(data.weekId);

  if (!data.overrideCredit) {
    const credit = await getCreditInfo(data.weekId, data.memberId);
    if (data.stakeCashUnits > credit.availableCredit) {
      throw new Error(
        `Stake ${data.stakeCashUnits} exceeds available credit ${credit.availableCredit}`
      );
    }
  }

  const fpStake = data.stakeFreePlayUnits ?? 0;

  if (fpStake > 0) {
    // Validate and deduct FP balance atomically
    const member = await prisma.member.findUnique({
      where: { id: data.memberId },
      select: { freePlayBalance: true },
    });
    if (!member || fpStake > member.freePlayBalance) {
      throw new Error(
        `FP stake ${fpStake} exceeds available FP balance ${member?.freePlayBalance ?? 0}`
      );
    }
  }

  await prisma.bet.create({
    data: {
      weekId: data.weekId,
      memberId: data.memberId,
      description: data.description,
      eventKey: data.eventKey || null,
      oddsAmerican: data.oddsAmerican,
      stakeCashUnits: data.stakeCashUnits,
      stakeFreePlayUnits: fpStake,
      ...(data.placedAt ? { placedAt: new Date(data.placedAt) } : {}),
    },
  });

  if (fpStake > 0) {
    await prisma.member.update({
      where: { id: data.memberId },
      data: { freePlayBalance: { decrement: fpStake } },
    });
  }

  revalidatePath(`/weeks/${data.weekId}`);
}

export async function settleBet(data: {
  betId: string;
  result: "WIN" | "LOSS" | "PUSH";
  payoutCashUnits: number;
}) {
  const bet = await prisma.bet.findUnique({
    where: { id: data.betId },
    include: { week: true },
  });
  if (!bet) throw new Error("Bet not found");
  const groupId = await getGroupId();
  if (bet.week.groupId !== groupId) throw new Error("Bet not found");

  await prisma.bet.update({
    where: { id: data.betId },
    data: {
      status: "SETTLED",
      result: data.result,
      payoutCashUnits: data.payoutCashUnits,
      settledAt: new Date(),
    },
  });
  revalidatePath(`/weeks/${bet.weekId}`);
}

export async function quickSettle(
  betId: string,
  result: "LOSS" | "PUSH"
) {
  const bet = await prisma.bet.findUnique({
    where: { id: betId },
    include: { week: true },
  });
  if (!bet) throw new Error("Bet not found");
  const groupId = await getGroupId();
  if (bet.week.groupId !== groupId) throw new Error("Bet not found");

  const payoutCashUnits = result === "LOSS" ? 0 : bet.stakeCashUnits;

  await prisma.bet.update({
    where: { id: betId },
    data: {
      status: "SETTLED",
      result,
      payoutCashUnits,
      settledAt: new Date(),
    },
  });
  revalidatePath(`/weeks/${bet.weekId}`);
}

// ── Edit / Void Bets ──

export async function editBet(data: {
  betId: string;
  description?: string;
  eventKey?: string | null;
  oddsAmerican?: number;
  stakeCashUnits?: number;
  stakeFreePlayUnits?: number;
}) {
  const bet = await prisma.bet.findUnique({
    where: { id: data.betId },
    include: { week: true },
  });
  if (!bet) throw new Error("Bet not found");
  const groupId = await getGroupId();
  if (bet.week.groupId !== groupId) throw new Error("Bet not found");
  if (bet.status !== "OPEN") throw new Error("Can only edit open bets");

  if (data.stakeCashUnits !== undefined && data.stakeCashUnits !== bet.stakeCashUnits) {
    const credit = await getCreditInfo(bet.weekId, bet.memberId);
    const effectiveAvailable = credit.availableCredit + bet.stakeCashUnits;
    if (data.stakeCashUnits > effectiveAvailable) {
      throw new Error(
        `New stake ${data.stakeCashUnits} exceeds available credit ${effectiveAvailable}`
      );
    }
  }

  // Handle FP balance delta
  if (data.stakeFreePlayUnits !== undefined && data.stakeFreePlayUnits !== bet.stakeFreePlayUnits) {
    const delta = data.stakeFreePlayUnits - bet.stakeFreePlayUnits;
    if (delta > 0) {
      const member = await prisma.member.findUnique({
        where: { id: bet.memberId },
        select: { freePlayBalance: true },
      });
      if (!member || delta > member.freePlayBalance) {
        throw new Error(
          `Additional FP ${delta} exceeds available FP balance ${member?.freePlayBalance ?? 0}`
        );
      }
      await prisma.member.update({
        where: { id: bet.memberId },
        data: { freePlayBalance: { decrement: delta } },
      });
    } else if (delta < 0) {
      await prisma.member.update({
        where: { id: bet.memberId },
        data: { freePlayBalance: { increment: Math.abs(delta) } },
      });
    }
  }

  await prisma.bet.update({
    where: { id: data.betId },
    data: {
      ...(data.description !== undefined && { description: data.description }),
      ...(data.eventKey !== undefined && { eventKey: data.eventKey }),
      ...(data.oddsAmerican !== undefined && { oddsAmerican: data.oddsAmerican }),
      ...(data.stakeCashUnits !== undefined && { stakeCashUnits: data.stakeCashUnits }),
      ...(data.stakeFreePlayUnits !== undefined && { stakeFreePlayUnits: data.stakeFreePlayUnits }),
    },
  });
  revalidatePath(`/weeks/${bet.weekId}`);
}

export async function voidBet(betId: string) {
  const bet = await prisma.bet.findUnique({
    where: { id: betId },
    include: { week: true },
  });
  if (!bet) throw new Error("Bet not found");
  const groupId = await getGroupId();
  if (bet.week.groupId !== groupId) throw new Error("Bet not found");
  if (bet.status !== "OPEN") throw new Error("Can only void open bets");

  await prisma.bet.update({
    where: { id: betId },
    data: { status: "VOIDED" },
  });

  // Return FP to member balance
  if (bet.stakeFreePlayUnits > 0) {
    await prisma.member.update({
      where: { id: bet.memberId },
      data: { freePlayBalance: { increment: bet.stakeFreePlayUnits } },
    });
  }

  revalidatePath(`/weeks/${bet.weekId}`);
}

// ── Bulk Create Bets ──

export async function createBulkBets(data: {
  weekId: string;
  memberId: string;
  overrideCredit?: boolean;
  bets: {
    description: string;
    eventKey?: string;
    oddsAmerican: number;
    stakeCashUnits: number;
    stakeFreePlayUnits?: number;
    placedAt?: string;
  }[];
}) {
  await verifyWeekOwnership(data.weekId);

  if (data.bets.length === 0) return { created: 0 };

  const totalCashStake = data.bets.reduce((sum, b) => sum + b.stakeCashUnits, 0);
  const totalFPStake = data.bets.reduce((sum, b) => sum + (b.stakeFreePlayUnits ?? 0), 0);

  if (!data.overrideCredit && totalCashStake > 0) {
    const credit = await getCreditInfo(data.weekId, data.memberId);
    if (totalCashStake > credit.availableCredit) {
      throw new Error(
        `Total stake ${totalCashStake} exceeds available credit ${credit.availableCredit}`
      );
    }
  }

  if (totalFPStake > 0) {
    const member = await prisma.member.findUnique({
      where: { id: data.memberId },
      select: { freePlayBalance: true },
    });
    if (!member || totalFPStake > member.freePlayBalance) {
      throw new Error(
        `Total FP stake ${totalFPStake} exceeds available FP balance ${member?.freePlayBalance ?? 0}`
      );
    }
  }

  await prisma.$transaction(
    data.bets.map((bet) =>
      prisma.bet.create({
        data: {
          weekId: data.weekId,
          memberId: data.memberId,
          description: bet.description,
          eventKey: bet.eventKey || null,
          oddsAmerican: bet.oddsAmerican,
          stakeCashUnits: bet.stakeCashUnits,
          stakeFreePlayUnits: bet.stakeFreePlayUnits ?? 0,
          ...(bet.placedAt ? { placedAt: new Date(bet.placedAt) } : {}),
        },
      })
    )
  );

  if (totalFPStake > 0) {
    await prisma.member.update({
      where: { id: data.memberId },
      data: { freePlayBalance: { decrement: totalFPStake } },
    });
  }

  revalidatePath(`/weeks/${data.weekId}`);
  return { created: data.bets.length };
}

// ── Bulk Settle ──

export async function bulkSettle(
  settlements: { betId: string; result: "WIN" | "LOSS" | "PUSH"; payoutCashUnits: number }[]
) {
  if (settlements.length === 0) return;

  const groupId = await getGroupId();
  const betIds = settlements.map((s) => s.betId);
  const bets = await prisma.bet.findMany({
    where: { id: { in: betIds } },
    include: { week: true },
  });

  if (bets.length !== settlements.length) throw new Error("Some bets not found");
  for (const bet of bets) {
    if (bet.week.groupId !== groupId) throw new Error("Unauthorized");
    if (bet.status !== "OPEN") throw new Error(`Bet is not open`);
  }

  const now = new Date();
  await prisma.$transaction(
    settlements.map((s) =>
      prisma.bet.update({
        where: { id: s.betId },
        data: {
          status: "SETTLED",
          result: s.result,
          payoutCashUnits: s.payoutCashUnits,
          settledAt: now,
        },
      })
    )
  );

  const weekIds = [...new Set(bets.map((b) => b.weekId))];
  for (const wid of weekIds) {
    revalidatePath(`/weeks/${wid}`);
  }
}

// ── Credit Limits ──

export async function updateCreditLimit(
  weekId: string,
  memberId: string,
  newLimit: number
) {
  const week = await verifyWeekOwnership(weekId);
  if (week.status !== "OPEN") throw new Error("Can only edit credit limits on open weeks");
  if (newLimit < 0) throw new Error("Credit limit cannot be negative");

  await prisma.weekMember.update({
    where: { weekId_memberId: { weekId, memberId } },
    data: { creditLimitUnits: newLimit },
  });
  revalidatePath(`/weeks/${weekId}`);
}

// ── Free Play Awards ──

export async function createFreePlayAward(data: {
  weekId: string;
  memberId: string;
  amountUnits: number;
  notes?: string;
}) {
  await verifyWeekOwnership(data.weekId);
  await prisma.freePlayAward.create({
    data: {
      weekId: data.weekId,
      memberId: data.memberId,
      amountUnits: data.amountUnits,
      source: "MANUAL",
      notes: data.notes || null,
    },
  });

  // Immediately credit member's FP balance
  await prisma.member.update({
    where: { id: data.memberId },
    data: { freePlayBalance: { increment: data.amountUnits } },
  });

  revalidatePath(`/weeks/${data.weekId}`);
}

export async function voidFreePlayAward(awardId: string) {
  const award = await prisma.freePlayAward.findUnique({
    where: { id: awardId },
    include: { week: true },
  });
  if (!award) throw new Error("Award not found");
  const groupId = await getGroupId();
  if (award.week.groupId !== groupId) throw new Error("Award not found");

  await prisma.freePlayAward.update({
    where: { id: awardId },
    data: { status: "VOIDED" },
  });

  // Deduct from member's FP balance
  await prisma.member.update({
    where: { id: award.memberId },
    data: { freePlayBalance: { decrement: award.amountUnits } },
  });

  revalidatePath(`/weeks/${award.weekId}`);
}

// ── Set FP Balance ──

export async function setFreePlayBalance(memberId: string, balance: number) {
  const groupId = await getGroupId();
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member || member.groupId !== groupId) throw new Error("Member not found");

  await prisma.member.update({
    where: { id: memberId },
    data: { freePlayBalance: balance },
  });
  revalidatePath("/members");
}

// ── Close Week ──

export async function closeWeek(weekId: string) {
  await verifyWeekOwnership(weekId);
  const openBets = await prisma.bet.count({
    where: { weekId, status: "OPEN" },
  });
  if (openBets > 0) {
    throw new Error(`Cannot close week: ${openBets} open bets remaining`);
  }

  await generatePromoAwards(weekId);
  await generateDefaultRebates(weekId);
  await updateFreePlayBalances(weekId);
  await generateWeekStatements(weekId);

  await prisma.week.update({
    where: { id: weekId },
    data: { status: "CLOSED", closedAt: new Date() },
  });
  revalidatePath(`/weeks/${weekId}`);
}

// ── Promos ──

export async function createPromo(data: {
  weekId: string;
  name: string;
  type: "LOSS_REBATE";
  ruleJson: Record<string, unknown>;
}) {
  await verifyWeekOwnership(data.weekId);
  await prisma.promo.create({
    data: {
      weekId: data.weekId,
      name: data.name,
      type: data.type,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ruleJson: data.ruleJson as any,
    },
  });
  revalidatePath(`/weeks/${data.weekId}`);
}

export async function createPromoBatch(
  weekId: string,
  promos: { name: string; type: "LOSS_REBATE"; ruleJson: Record<string, unknown> }[]
) {
  await verifyWeekOwnership(weekId);
  for (const p of promos) {
    await prisma.promo.create({
      data: {
        weekId,
        name: p.name,
        type: p.type,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ruleJson: p.ruleJson as any,
      },
    });
  }
  revalidatePath(`/weeks/${weekId}`);
}

export async function updatePromo(
  promoId: string,
  data: { name?: string; ruleJson?: Record<string, unknown> }
) {
  const promo = await prisma.promo.findUnique({
    where: { id: promoId },
    include: { week: true },
  });
  if (!promo) throw new Error("Promo not found");
  const groupId = await getGroupId();
  if (promo.week.groupId !== groupId) throw new Error("Promo not found");

  await prisma.promo.update({
    where: { id: promoId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(data.ruleJson !== undefined && { ruleJson: data.ruleJson as any }),
    },
  });
  revalidatePath(`/weeks/${promo.weekId}`);
}

export async function togglePromo(promoId: string) {
  const promo = await prisma.promo.findUnique({
    where: { id: promoId },
    include: { week: true },
  });
  if (!promo) throw new Error("Promo not found");
  const groupId = await getGroupId();
  if (promo.week.groupId !== groupId) throw new Error("Promo not found");

  await prisma.promo.update({
    where: { id: promoId },
    data: { active: !promo.active },
  });
  revalidatePath(`/weeks/${promo.weekId}`);
}

export async function deletePromo(promoId: string) {
  const promo = await prisma.promo.findUnique({
    where: { id: promoId },
    include: { week: true },
  });
  if (!promo) throw new Error("Promo not found");
  const groupId = await getGroupId();
  if (promo.week.groupId !== groupId) throw new Error("Promo not found");

  const awards = await prisma.freePlayAward.count({
    where: { promoId },
  });
  if (awards > 0) {
    throw new Error("Cannot delete promo with existing awards. Deactivate it instead.");
  }

  await prisma.promo.delete({ where: { id: promoId } });
  revalidatePath(`/weeks/${promo.weekId}`);
}

// ── Admin ──

export async function createGroupWithOperator(data: {
  groupName: string;
  operatorName: string;
  operatorPassword: string;
}) {
  const session = await requireSession();
  if (!session.isAdmin) throw new Error("Admin only");

  const group = await prisma.group.create({
    data: { name: data.groupName },
  });

  await prisma.operator.create({
    data: {
      groupId: group.id,
      name: data.operatorName,
      password: data.operatorPassword,
    },
  });

  revalidatePath("/admin");
}
