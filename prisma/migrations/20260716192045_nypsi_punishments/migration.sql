/*
  Warnings:

  - You are about to drop the column `banned` on the `Economy` table. All the data in the column will be lost.
  - You are about to drop the column `blacklisted` on the `User` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "PunishmentType" AS ENUM ('ECONOMY_BAN', 'BLACKLIST');

-- CreateEnum
CREATE TYPE "PunishmentEndReason" AS ENUM ('REVOKED', 'REPLACED', 'SEASON_RESET');

-- CreateTable
CREATE TABLE "Punishment" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "PunishmentType" NOT NULL,
    "reason" TEXT NOT NULL,
    "moderatorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "season" INTEGER,
    "endedAt" TIMESTAMP(3),
    "endedById" TEXT,
    "endReason" "PunishmentEndReason",
    "endNote" TEXT,

    CONSTRAINT "Punishment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Punishment_userId_type_idx" ON "Punishment"("userId", "type");

-- AddForeignKey
ALTER TABLE "Punishment" ADD CONSTRAINT "Punishment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Punishment" ADD CONSTRAINT "Punishment_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Punishment" ADD CONSTRAINT "Punishment_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- BackfillBlacklists
INSERT INTO "Punishment" ("userId", "type", "reason")
SELECT
    "id",
    'BLACKLIST'::"PunishmentType",
    'legacy blacklist'
FROM "User"
WHERE "blacklisted" = true;

-- AlterTable
ALTER TABLE "Economy" DROP COLUMN "banned";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "blacklisted";