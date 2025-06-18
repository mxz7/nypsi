-- CreateTable
CREATE TABLE "Marriage" (
    "userId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "marriageStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Marriage_pkey" PRIMARY KEY ("userId","partnerId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Marriage_userId_key" ON "Marriage"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Marriage_partnerId_key" ON "Marriage"("partnerId");

-- AddForeignKey
ALTER TABLE "Marriage" ADD CONSTRAINT "Marriage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
