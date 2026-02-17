-- CreateEnum
CREATE TYPE "PromoType" AS ENUM ('LOSS_REBATE');

-- AlterTable
ALTER TABLE "FreePlayAward" ADD COLUMN     "promoId" TEXT;

-- CreateTable
CREATE TABLE "Promo" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PromoType" NOT NULL DEFAULT 'LOSS_REBATE',
    "ruleJson" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Promo_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Promo" ADD CONSTRAINT "Promo_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
