-- AlterTable
ALTER TABLE "EconomyGuildMember" ADD COLUMN     "contributedMoneyThisLevel" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "contributedXpThisLevel" INTEGER NOT NULL DEFAULT 0;
