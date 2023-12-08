-- CreateEnum
CREATE TYPE "ProfileViewSource" AS ENUM ('WEB', 'BOT');

-- CreateTable
CREATE TABLE "ProfileView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "ProfileViewSource" NOT NULL,
    "viewerId" TEXT,
    "viewerIp" TEXT,
    "referrer" TEXT,

    CONSTRAINT "ProfileView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfileView_userId_idx" ON "ProfileView"("userId");

-- AddForeignKey
ALTER TABLE "ProfileView" ADD CONSTRAINT "ProfileView_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileView" ADD CONSTRAINT "ProfileView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
