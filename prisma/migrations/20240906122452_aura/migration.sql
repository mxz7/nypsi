-- CreateTable
CREATE TABLE "Aura" (
    "id" SERIAL NOT NULL,
    "recipientId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "Aura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Aura_recipientId_idx" ON "Aura"("recipientId");

-- CreateIndex
CREATE INDEX "Aura_senderId_idx" ON "Aura"("senderId");
