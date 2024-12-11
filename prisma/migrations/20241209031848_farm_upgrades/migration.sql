-- CreateTable
CREATE TABLE "FarmUpgrades" (
    "userId" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "upgradeId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "FarmUpgrades_pkey" PRIMARY KEY ("userId","plantId","upgradeId")
);

-- AddForeignKey
ALTER TABLE "FarmUpgrades" ADD CONSTRAINT "FarmUpgrades_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
