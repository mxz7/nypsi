-- CreateTable
CREATE TABLE "Museum" (
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Museum_pkey" PRIMARY KEY ("userId","itemId")
);

-- AddForeignKey
ALTER TABLE "Museum" ADD CONSTRAINT "Museum_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
