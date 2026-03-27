-- CreateTable
CREATE TABLE "ChessPuzzleStats" (
    "userId" TEXT NOT NULL,
    "solved" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "bestStreak" INTEGER NOT NULL DEFAULT 0,
    "averageWinningRating" DOUBLE PRECISION,
    "fastestSolve" DOUBLE PRECISION,
    "averageSolveTime" DOUBLE PRECISION,

    CONSTRAINT "ChessPuzzleStats_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "ChessPuzzleStats" ADD CONSTRAINT "ChessPuzzleStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
