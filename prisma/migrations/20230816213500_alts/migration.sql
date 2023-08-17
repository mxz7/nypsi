-- AlterTable
ALTER TABLE "Guild" ADD COLUMN     "alt_punish" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Alt" (
    "guildId" TEXT NOT NULL,
    "mainId" TEXT NOT NULL,
    "altId" TEXT NOT NULL,

    CONSTRAINT "Alt_pkey" PRIMARY KEY ("userId","guildId")
);
