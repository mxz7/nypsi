-- CreateTable
CREATE TABLE "ItemRequest" (
    "id" SERIAL NOT NULL,
    "ownerId" TEXT NOT NULL,
    "requestedItems" TEXT[],
    "offeredItems" TEXT[],
    "offeredMoney" BIGINT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ItemRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemRequest_messageId_key" ON "ItemRequest"("messageId");

-- AddForeignKey
ALTER TABLE "ItemRequest" ADD CONSTRAINT "ItemRequest_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
