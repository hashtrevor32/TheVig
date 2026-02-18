import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  // Check existing groups
  const groups = await prisma.group.findMany({ include: { members: true, operators: true } });
  console.log(`Found ${groups.length} existing groups`);

  let group = groups[0];
  let operatorExists = false;

  if (!group) {
    // Create a group + operator
    group = await prisma.group.create({ data: { name: "Test Pool" } });
    await prisma.operator.create({
      data: { groupId: group.id, name: "admin", password: "admin123" },
    });
    console.log("Created group 'Test Pool' with operator admin/admin123");
  } else {
    console.log(`Using existing group: ${group.name}`);
    operatorExists = group.operators.length > 0;
    if (operatorExists) {
      console.log(`Operator: ${group.operators[0].name}`);
    }
  }

  // Create members if needed
  let members = await prisma.member.findMany({ where: { groupId: group.id } });
  const memberNames = ["Mike", "Jake", "Tommy", "Rico", "Ace"];

  for (const name of memberNames) {
    if (!members.find((m) => m.name === name)) {
      await prisma.member.create({ data: { name, groupId: group.id } });
      console.log(`Created member: ${name}`);
    }
  }

  members = await prisma.member.findMany({ where: { groupId: group.id } });
  console.log(`Total members: ${members.length}`);

  // Set some FP balances
  for (const m of members) {
    if (m.freePlayBalance === 0) {
      const fpAmount = [200, 150, 100, 250, 175][members.indexOf(m)] || 100;
      await prisma.member.update({
        where: { id: m.id },
        data: { freePlayBalance: fpAmount },
      });
      console.log(`Set ${m.name} FP balance to ${fpAmount}`);
    }
  }

  // Create a test week
  const existingWeeks = await prisma.week.findMany({
    where: { groupId: group.id, status: "OPEN" },
  });

  let week;
  if (existingWeeks.length > 0) {
    week = existingWeeks[0];
    console.log(`Using existing open week: ${week.name}`);
  } else {
    const now = new Date();
    const endAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    week = await prisma.week.create({
      data: {
        groupId: group.id,
        name: "Week 8 - Test",
        startAt: now,
        endAt,
      },
    });
    console.log(`Created week: ${week.name}`);
  }

  // Add members to week if not already
  for (const m of members) {
    const existing = await prisma.weekMember.findUnique({
      where: { weekId_memberId: { weekId: week.id, memberId: m.id } },
    });
    if (!existing) {
      await prisma.weekMember.create({
        data: { weekId: week.id, memberId: m.id, creditLimitUnits: 2000 },
      });
      console.log(`Added ${m.name} to week with 2000 credit`);
    }
  }

  // Add test bets
  const existingBets = await prisma.bet.count({ where: { weekId: week.id } });
  if (existingBets > 0) {
    console.log(`Week already has ${existingBets} bets, skipping bet creation`);
  } else {
    const testBets = [
      // Mike - cash bets
      { member: "Mike", desc: "Chiefs -3.5", odds: -110, cash: 200, fp: 0 },
      { member: "Mike", desc: "Lakers ML", odds: +150, cash: 100, fp: 0 },
      { member: "Mike", desc: "Over 45.5 (KC/BUF)", odds: -105, cash: 150, fp: 0 },
      // Mike - free play bet
      { member: "Mike", desc: "Celtics -7.5", odds: -110, cash: 0, fp: 50 },

      // Jake - cash bets
      { member: "Jake", desc: "49ers ML", odds: -135, cash: 250, fp: 0 },
      { member: "Jake", desc: "Under 220.5 (BOS/MIL)", odds: +100, cash: 100, fp: 0 },
      // Jake - free play bet
      { member: "Jake", desc: "Nuggets +4.5", odds: -110, cash: 0, fp: 75 },

      // Tommy - cash bets
      { member: "Tommy", desc: "Eagles -2.5", odds: -115, cash: 300, fp: 0 },
      { member: "Tommy", desc: "Warriors ML", odds: +200, cash: 50, fp: 0 },
      // Tommy - free play bet
      { member: "Tommy", desc: "Blackjack Hand #47", odds: -110, cash: 0, fp: 40 },

      // Rico - cash bets
      { member: "Rico", desc: "Yankees ML", odds: -150, cash: 150, fp: 0 },
      { member: "Rico", desc: "Parlay: Chiefs ML + Over 45.5", odds: +260, cash: 100, fp: 0 },

      // Ace - cash bets
      { member: "Ace", desc: "Dodgers -1.5", odds: +120, cash: 200, fp: 0 },
      // Ace - free play bet
      { member: "Ace", desc: "Roulette - Red", odds: -110, cash: 0, fp: 60 },
      { member: "Ace", desc: "Packers +6.5", odds: -110, cash: 175, fp: 0 },
    ];

    for (const b of testBets) {
      const member = members.find((m) => m.name === b.member)!;
      await prisma.bet.create({
        data: {
          weekId: week.id,
          memberId: member.id,
          description: b.desc,
          oddsAmerican: b.odds,
          stakeCashUnits: b.cash,
          stakeFreePlayUnits: b.fp,
        },
      });

      // Deduct FP if used
      if (b.fp > 0) {
        await prisma.member.update({
          where: { id: member.id },
          data: { freePlayBalance: { decrement: b.fp } },
        });
      }

      console.log(`  ${b.member}: ${b.desc} (${b.cash > 0 ? b.cash + " cash" : b.fp + " FP"}) @ ${b.odds > 0 ? "+" : ""}${b.odds}`);
    }

    console.log(`\nCreated ${testBets.length} test bets`);
  }

  // Summary
  const finalMembers = await prisma.member.findMany({ where: { groupId: group.id } });
  console.log("\n=== SUMMARY ===");
  for (const m of finalMembers) {
    console.log(`${m.name}: FP Balance = ${m.freePlayBalance}`);
  }
  console.log(`Week: ${week.name} (ID: ${week.id})`);

  await prisma.$disconnect();
}

main().catch(console.error);
