import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const week = await prisma.week.findFirst({
    where: { status: "OPEN" },
    orderBy: { createdAt: "desc" },
  });
  if (!week) { console.log("No open week!"); return; }

  const members = await prisma.member.findMany({ where: { groupId: week.groupId } });
  const getMember = (name: string) => members.find((m) => m.name === name);

  // Check if we already added bets for Mike
  const mikeBets = await prisma.bet.count({
    where: { weekId: week.id, memberId: getMember("Mike")?.id },
  });
  if (mikeBets > 0) {
    console.log(`Mike already has ${mikeBets} bets in this week, skipping`);
    await prisma.$disconnect();
    return;
  }

  const testBets = [
    // Mike - cash bets
    { member: "Mike", desc: "Chiefs -3.5", odds: -110, cash: 200, fp: 0 },
    { member: "Mike", desc: "Lakers ML", odds: 150, cash: 100, fp: 0 },
    { member: "Mike", desc: "Celtics -7.5", odds: -110, cash: 0, fp: 50 },

    // Jake - cash + FP
    { member: "Jake", desc: "49ers ML", odds: -135, cash: 250, fp: 0 },
    { member: "Jake", desc: "Nuggets +4.5", odds: -110, cash: 0, fp: 75 },

    // Tommy - cash + FP
    { member: "Tommy", desc: "Eagles -2.5", odds: -115, cash: 300, fp: 0 },
    { member: "Tommy", desc: "Blackjack Hand #47", odds: -110, cash: 0, fp: 40 },

    // Rico - cash only
    { member: "Rico", desc: "Yankees ML", odds: -150, cash: 150, fp: 0 },
    { member: "Rico", desc: "Parlay: Chiefs ML + Over 45.5", odds: 260, cash: 100, fp: 0 },

    // Ace - cash + FP
    { member: "Ace", desc: "Dodgers -1.5", odds: 120, cash: 200, fp: 0 },
    { member: "Ace", desc: "Roulette - Red", odds: -110, cash: 0, fp: 60 },
    { member: "Ace", desc: "Packers +6.5", odds: -110, cash: 175, fp: 0 },
  ];

  for (const b of testBets) {
    const member = getMember(b.member);
    if (!member) { console.log(`Member ${b.member} not found!`); continue; }

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

    if (b.fp > 0) {
      await prisma.member.update({
        where: { id: member.id },
        data: { freePlayBalance: { decrement: b.fp } },
      });
    }

    console.log(`  ${b.member}: ${b.desc} (${b.cash > 0 ? b.cash + " cash" : b.fp + " FP"}) @ ${b.odds > 0 ? "+" : ""}${b.odds}`);
  }

  console.log(`\nCreated ${testBets.length} bets in week "${week.name}"`);

  // Show final FP balances
  const updated = await prisma.member.findMany({
    where: { name: { in: ["Mike", "Jake", "Tommy", "Rico", "Ace"] }, groupId: week.groupId },
  });
  console.log("\nFP Balances:");
  for (const m of updated) {
    console.log(`  ${m.name}: ${m.freePlayBalance} FP`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
