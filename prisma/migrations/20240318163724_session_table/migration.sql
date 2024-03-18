-- DropIndex
DROP INDEX "CommandUse_userId_command_key";

-- DropIndex
DROP INDEX "Leaderboards_userId_idx";

-- AlterTable
ALTER TABLE "CommandUse" ADD CONSTRAINT "CommandUse_pkey" PRIMARY KEY ("userId", "command");

-- AlterTable
ALTER TABLE "EconomyGuild" ALTER COLUMN "motd" SET DEFAULT '/guild motd';

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommandUse_userId_idx" ON "CommandUse"("userId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
