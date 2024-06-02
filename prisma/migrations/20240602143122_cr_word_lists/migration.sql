-- CreateEnum
CREATE TYPE "ChatReactionWordList" AS ENUM ('english_1k', 'english_5k', 'english_10k', 'custom');

-- AlterTable
ALTER TABLE "ChatReaction" ADD COLUMN     "wordListType" "ChatReactionWordList" NOT NULL DEFAULT 'english_1k';
