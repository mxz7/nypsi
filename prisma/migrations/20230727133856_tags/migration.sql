/*
  Warnings:

  - You are about to drop the column `badges` on the `User` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "ActiveChannels" DROP CONSTRAINT "ActiveChannels_userId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "badges";

-- CreateTable
CREATE TABLE "Tags" (
    "userId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Tags_userId_tagId_key" ON "Tags"("userId", "tagId");

-- AddForeignKey
ALTER TABLE "Tags" ADD CONSTRAINT "Tags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveChannels" ADD CONSTRAINT "ActiveChannels_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
