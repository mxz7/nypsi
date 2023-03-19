-- CreateTable
CREATE TABLE "Preferences" (
    "userId" TEXT NOT NULL,
    "duelRequests" BOOLEAN NOT NULL DEFAULT true,
    "auctionConfirm" INTEGER NOT NULL DEFAULT 25000000,

    CONSTRAINT "Preferences_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "Preferences" ADD CONSTRAINT "Preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
