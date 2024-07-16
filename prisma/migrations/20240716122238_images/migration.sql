-- CreateTable
CREATE TABLE "Images" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bytes" BIGINT NOT NULL,

    CONSTRAINT "Images_pkey" PRIMARY KEY ("id")
);
