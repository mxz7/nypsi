-- AlterTable
ALTER TABLE "EconomyGuild" ADD COLUMN     "avatarId" TEXT;

-- AddForeignKey
ALTER TABLE "EconomyGuild" ADD CONSTRAINT "EconomyGuild_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "Images"("id") ON DELETE SET NULL ON UPDATE CASCADE;
