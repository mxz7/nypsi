-- CreateEnum
CREATE TYPE "BoosterScope" AS ENUM ('global', 'user');

-- AlterTable
ALTER TABLE "Booster" ADD COLUMN     "scope" "BoosterScope" NOT NULL DEFAULT 'user';

-- CreateIndex
CREATE INDEX "Booster_scope_idx" ON "Booster"("scope");

-- CreateIndex
CREATE INDEX "Booster_userId_idx" ON "Booster"("userId");
