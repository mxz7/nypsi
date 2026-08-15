-- CreateTable
CREATE TABLE "Clicks" (
    "userId" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Clicks_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "Clicks" ADD CONSTRAINT "Clicks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
