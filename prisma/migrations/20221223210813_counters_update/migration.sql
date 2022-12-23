/*
  Warnings:

  - The primary key for the `GuildCounter` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `enabled` on the `GuildCounter` table. All the data in the column will be lost.
  - You are about to drop the column `filterBots` on the `GuildCounter` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[channel]` on the table `GuildCounter` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "TrackingType" AS ENUM ('MEMBERS', 'HUMANS', 'BOOSTS', 'RICHEST_MEMBER', 'TOTAL_ITEM', 'TOTAL_BALANCE');

-- DropIndex
DROP INDEX "GuildCounter_guildId_key";

-- AlterTable
ALTER TABLE "GuildCounter" DROP CONSTRAINT "GuildCounter_pkey",
DROP COLUMN "enabled",
DROP COLUMN "filterBots",
ADD COLUMN     "totalItem" TEXT,
ADD COLUMN     "tracks" "TrackingType" NOT NULL DEFAULT 'HUMANS',
ALTER COLUMN "format" SET DEFAULT 'members: %value%',
ALTER COLUMN "channel" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "GuildCounter_channel_key" ON "GuildCounter"("channel");
