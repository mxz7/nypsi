/*
  Warnings:

  - You are about to drop the column `vote` on the `DMSettings` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('daily', 'weekly');

-- AlterTable
ALTER TABLE "DMSettings" DROP COLUMN "vote";

-- AlterTable
ALTER TABLE "Economy" ADD COLUMN     "dailyTaskStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "weeklyTaskStreak" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Task" (
    "user_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "progress" BIGINT NOT NULL DEFAULT 0,
    "target" BIGINT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "prize" TEXT NOT NULL,
    "type" "TaskType" NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("user_id","task_id")
);

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Economy"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
