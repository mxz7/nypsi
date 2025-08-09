-- AlterTable
ALTER TABLE "EconomyGuildMember" ADD COLUMN     "contributedMoneyToday" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "contributedXpToday" INTEGER NOT NULL DEFAULT 0;
