-- CreateTable
CREATE TABLE "Captcha" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "solved" BOOLEAN NOT NULL DEFAULT false,
    "received" INTEGER NOT NULL DEFAULT 0,
    "visits" TIMESTAMP(3)[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "solvedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Captcha_pkey" PRIMARY KEY ("id")
);
