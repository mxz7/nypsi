-- CreateTable
CREATE TABLE "Museum" (
    "userId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "amount" BIGINT NOT NULL DEFAULT 1,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Museum_pkey" PRIMARY KEY ("userId","item")
);

-- AddForeignKey
ALTER TABLE "Museum" ADD CONSTRAINT "Museum_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
