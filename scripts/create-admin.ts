import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";
dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const group = await prisma.group.findFirst();
  if (!group) {
    console.error("No group found");
    process.exit(1);
  }

  const existing = await prisma.operator.findUnique({ where: { name: "admin" } });
  if (existing) {
    console.log("Admin operator already exists");
    return;
  }

  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.error("ADMIN_PASSWORD env var not set");
    process.exit(1);
  }

  await prisma.operator.create({
    data: {
      groupId: group.id,
      name: "admin",
      password,
      isAdmin: true,
    },
  });

  console.log(`Created admin operator for group "${group.name}" (${group.id})`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
