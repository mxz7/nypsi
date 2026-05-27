-- CreateEnum
CREATE TYPE "SudokuDifficulty" AS ENUM ('easy', 'medium', 'hard', 'expert');

-- CreateEnum
CREATE TYPE "SudokuState" AS ENUM ('active', 'completed', 'resigned');

-- CreateEnum
CREATE TYPE "SudokuCoordMode" AS ENUM ('box', 'coordinates');

-- AlterTable
ALTER TABLE "Preferences" ADD COLUMN     "sudokuCoordMode" "SudokuCoordMode" NOT NULL DEFAULT 'box';

-- CreateTable
CREATE TABLE "SudokuGame" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "puzzle" TEXT NOT NULL,
    "solution" TEXT NOT NULL,
    "difficulty" "SudokuDifficulty" NOT NULL,
    "board" TEXT NOT NULL,
    "state" "SudokuState" NOT NULL DEFAULT 'active',
    "mistakes" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,

    CONSTRAINT "SudokuGame_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SudokuGame_userId_state_idx" ON "SudokuGame"("userId", "state");

-- AddForeignKey
ALTER TABLE "SudokuGame" ADD CONSTRAINT "SudokuGame_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
