-- CreateTable
CREATE TABLE "Museum" (
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "favorited" INTEGER,

    CONSTRAINT "Museum_pkey" PRIMARY KEY ("userId","itemId")
);

-- CreateTable
CREATE TABLE "MuseumDonation" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MuseumDonation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MuseumDonation_itemId_userId_amount_idx" ON "MuseumDonation"("itemId", "userId", "amount");

-- CreateIndex
CREATE INDEX "MuseumDonation_createdAt_itemId_amount_idx" ON "MuseumDonation"("createdAt", "itemId", "amount");

-- AddForeignKey
ALTER TABLE "Museum" ADD CONSTRAINT "Museum_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MuseumDonation" ADD CONSTRAINT "MuseumDonation_userId_itemId_fkey" FOREIGN KEY ("userId", "itemId") REFERENCES "Museum"("userId", "itemId") ON DELETE CASCADE ON UPDATE CASCADE;
