-- CreateTable
CREATE TABLE "ItemSourceStats" (
    "itemId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "amount" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "ItemSourceStats_pkey" PRIMARY KEY ("itemId","source")
);
