-- AlterTable
ALTER TABLE "EconomyGuild" ADD COLUMN     "tokens" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "EconomyGuildUpgrades" (
    "guildName" TEXT NOT NULL,
    "upgradeId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "EconomyGuildUpgrades_pkey" PRIMARY KEY ("guildName","upgradeId")
);

-- AddForeignKey
ALTER TABLE "EconomyGuildUpgrades" ADD CONSTRAINT "EconomyGuildUpgrades_guildName_fkey" FOREIGN KEY ("guildName") REFERENCES "EconomyGuild"("guildName") ON DELETE CASCADE ON UPDATE CASCADE;
