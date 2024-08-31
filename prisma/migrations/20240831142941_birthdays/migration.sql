-- AlterTable
ALTER TABLE "Guild" ADD COLUMN     "birthdayHook" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "birthday" TIMESTAMP(3),
ADD COLUMN     "birthdayAnnounce" BOOLEAN NOT NULL DEFAULT true;
