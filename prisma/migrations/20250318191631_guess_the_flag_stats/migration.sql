-- CreateTable
CREATE TABLE "FlagGame" (
    "id" SERIAL NOT NULL,
    "guesses" TEXT[],
    "country" TEXT NOT NULL,
    "won" BOOLEAN NOT NULL,
    "time" INTEGER,
    "userId" TEXT NOT NULL,

    CONSTRAINT "FlagGame_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FlagGame_userId_idx" ON "FlagGame"("userId");

-- AddForeignKey
ALTER TABLE "FlagGame" ADD CONSTRAINT "FlagGame_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
