-- CreateEnum
CREATE TYPE "WeekStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "BetStatus" AS ENUM ('OPEN', 'SETTLED');

-- CreateEnum
CREATE TYPE "BetResult" AS ENUM ('WIN', 'LOSS', 'PUSH');

-- CreateEnum
CREATE TYPE "FreePlaySource" AS ENUM ('PROMO', 'MANUAL');

-- CreateEnum
CREATE TYPE "FreePlayStatus" AS ENUM ('EARNED', 'VOIDED');

-- CreateTable
CREATE TABLE "Week" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "WeekStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Week_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeekMember" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "creditLimitUnits" INTEGER NOT NULL DEFAULT 1000,

    CONSTRAINT "WeekMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bet" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "eventKey" TEXT,
    "oddsAmerican" INTEGER NOT NULL,
    "stakeCashUnits" INTEGER NOT NULL,
    "stakeFreePlayUnits" INTEGER NOT NULL DEFAULT 0,
    "status" "BetStatus" NOT NULL DEFAULT 'OPEN',
    "result" "BetResult",
    "payoutCashUnits" INTEGER,
    "payoutFreePlayUnits" INTEGER,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreePlayAward" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "source" "FreePlaySource" NOT NULL DEFAULT 'MANUAL',
    "amountUnits" INTEGER NOT NULL,
    "status" "FreePlayStatus" NOT NULL DEFAULT 'EARNED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreePlayAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeekStatement" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "cashProfitUnits" INTEGER NOT NULL,
    "freePlayEarnedUnits" INTEGER NOT NULL,
    "weeklyScoreUnits" INTEGER NOT NULL,
    "owesHouseUnits" INTEGER NOT NULL,
    "houseOwesUnits" INTEGER NOT NULL,
    "houseOwesFreePlayUnits" INTEGER NOT NULL,

    CONSTRAINT "WeekStatement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeekMember_weekId_memberId_key" ON "WeekMember"("weekId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "WeekStatement_weekId_memberId_key" ON "WeekStatement"("weekId", "memberId");

-- AddForeignKey
ALTER TABLE "Week" ADD CONSTRAINT "Week_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekMember" ADD CONSTRAINT "WeekMember_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekMember" ADD CONSTRAINT "WeekMember_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreePlayAward" ADD CONSTRAINT "FreePlayAward_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreePlayAward" ADD CONSTRAINT "FreePlayAward_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekStatement" ADD CONSTRAINT "WeekStatement_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekStatement" ADD CONSTRAINT "WeekStatement_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
