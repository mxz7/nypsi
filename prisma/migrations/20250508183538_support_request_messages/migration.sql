-- CreateTable
CREATE TABLE "SupportRequestMessage" (
    "id" TEXT NOT NULL,
    "supportRequestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "SupportRequestMessage_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SupportRequestMessage" ADD CONSTRAINT "SupportRequestMessage_supportRequestId_fkey" FOREIGN KEY ("supportRequestId") REFERENCES "SupportRequest"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
