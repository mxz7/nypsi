-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_user_id_fkey";

-- DropIndex
DROP INDEX "Inventory_userId_item_key";

-- AlterTable
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_pkey" PRIMARY KEY ("userId", "item");

-- CreateIndex
CREATE INDEX "Achievements_userId_idx" ON "Achievements"("userId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
