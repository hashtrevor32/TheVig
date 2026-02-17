import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const group = await prisma.group.upsert({
    where: { id: "main-group" },
    update: {},
    create: {
      id: "main-group",
      name: "Main Group",
    },
  });

  await prisma.member.upsert({
    where: { id: "admin-member" },
    update: {},
    create: {
      id: "admin-member",
      groupId: group.id,
      name: "Admin",
    },
  });

  console.log("Seeded: Group and Admin member created");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
