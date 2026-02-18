-- AlterEnum
ALTER TYPE "FreePlaySource" ADD VALUE 'DEFAULT_REBATE';

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "freePlayBalance" INTEGER NOT NULL DEFAULT 0;
