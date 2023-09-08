-- AlterTable
ALTER TABLE "Economy" ADD COLUMN     "level" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "prestigeDates" TIMESTAMP(3)[];

-- CreateTable
CREATE TABLE "Upgrades" (
    "userId" TEXT NOT NULL,
    "upgradeId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "Upgrades_pkey" PRIMARY KEY ("userId","upgradeId")
);

-- AddForeignKey
ALTER TABLE "Upgrades" ADD CONSTRAINT "Upgrades_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
