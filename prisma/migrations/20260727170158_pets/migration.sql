-- CreateTable
CREATE TABLE "Pet" (
    "userId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "activations" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "Pet_pkey" PRIMARY KEY ("userId","petId")
);

-- AddForeignKey
ALTER TABLE "Pet" ADD CONSTRAINT "Pet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
