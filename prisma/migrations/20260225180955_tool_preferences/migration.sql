-- CreateEnum
CREATE TYPE "ToolPreferenceSelection" AS ENUM ('terrible', 'normal', 'incredible', 'highest');

-- AlterTable
ALTER TABLE "Economy" ADD COLUMN     "preferredGun" "ToolPreferenceSelection" NOT NULL DEFAULT 'highest',
ADD COLUMN     "preferredPickaxe" "ToolPreferenceSelection" NOT NULL DEFAULT 'highest',
ADD COLUMN     "preferredRod" "ToolPreferenceSelection" NOT NULL DEFAULT 'highest',
ADD COLUMN     "useBestToolOnUnbreaking" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "useLowerToolOnEmpty" BOOLEAN NOT NULL DEFAULT true;
