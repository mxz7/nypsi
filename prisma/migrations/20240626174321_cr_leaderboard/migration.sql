-- CreateTable
CREATE TABLE "ChatReactionLeaderboards" (
    "userId" TEXT NOT NULL,
    "daily" BOOLEAN NOT NULL,
    "time" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatReactionLeaderboards_pkey" PRIMARY KEY ("daily","userId")
);

-- AddForeignKey
ALTER TABLE "ChatReactionLeaderboards" ADD CONSTRAINT "ChatReactionLeaderboards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
