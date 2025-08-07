-- CreateEnum
CREATE TYPE "EconomyGuildRole" AS ENUM ('member', 'admin', 'owner');

-- AlterTable
ALTER TABLE "EconomyGuildMember" ADD COLUMN     "role" "EconomyGuildRole" NOT NULL DEFAULT 'member';
