-- CreateTable
CREATE TABLE "WordleGame" (
    "id" SERIAL NOT NULL,
    "guesses" TEXT[],
    "word" TEXT NOT NULL,
    "won" BOOLEAN NOT NULL,
    "time" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "WordleGame_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "WordleGame" ADD CONSTRAINT "WordleGame_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
