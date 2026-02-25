-- CreateEnum
CREATE TYPE "ToolPreferenceSelection" AS ENUM ('terrible', 'normal', 'incredible', 'highest');

-- CreateTable
CREATE TABLE "ToolPreferences" (
    "userId" TEXT NOT NULL,
    "pickaxeType" "ToolPreferenceSelection" NOT NULL DEFAULT 'highest',
    "rodType" "ToolPreferenceSelection" NOT NULL DEFAULT 'highest',
    "gunType" "ToolPreferenceSelection" NOT NULL DEFAULT 'highest',
    "bestToolOnUnbreaking" BOOLEAN NOT NULL DEFAULT true,
    "useLowerToolOnEmpty" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ToolPreferences_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "ToolPreferences" ADD CONSTRAINT "ToolPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
