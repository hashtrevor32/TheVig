"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { getCreditInfo } from "./credit";
import { generateWeekStatements } from "./settlement";
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

  await prisma.bet.create({
    data: {
      weekId: data.weekId,
      memberId: data.memberId,
      description: data.description,
      eventKey: data.eventKey || null,
      oddsAmerican: data.oddsAmerican,
      stakeCashUnits: data.stakeCashUnits,
      stakeFreePlayUnits: data.stakeFreePlayUnits ?? 0,
    },
  });
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
  revalidatePath(`/weeks/${award.weekId}`);
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
