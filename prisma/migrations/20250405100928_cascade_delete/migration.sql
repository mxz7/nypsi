-- DropForeignKey
ALTER TABLE "Captcha" DROP CONSTRAINT "Captcha_userId_fkey";

-- DropForeignKey
ALTER TABLE "ChatFilter" DROP CONSTRAINT "ChatFilter_guildId_fkey";

-- DropForeignKey
ALTER TABLE "FlagGame" DROP CONSTRAINT "FlagGame_userId_fkey";

-- DropForeignKey
ALTER TABLE "GuildEvidenceCredit" DROP CONSTRAINT "GuildEvidenceCredit_guildId_fkey";

-- DropForeignKey
ALTER TABLE "Offer" DROP CONSTRAINT "Offer_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "Offer" DROP CONSTRAINT "Offer_targetId_fkey";

-- DropForeignKey
ALTER TABLE "Purchases" DROP CONSTRAINT "Purchases_userId_fkey";

-- AddForeignKey
ALTER TABLE "FlagGame" ADD CONSTRAINT "FlagGame_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatFilter" ADD CONSTRAINT "ChatFilter_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildEvidenceCredit" ADD CONSTRAINT "GuildEvidenceCredit_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchases" ADD CONSTRAINT "Purchases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Captcha" ADD CONSTRAINT "Captcha_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
