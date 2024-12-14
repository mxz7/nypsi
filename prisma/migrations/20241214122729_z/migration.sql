-- CreateTable
CREATE TABLE "z" (
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hasInvite" BOOLEAN NOT NULL DEFAULT false,
    "removed" BOOLEAN NOT NULL DEFAULT false,
    "rating" SMALLINT NOT NULL DEFAULT 0,
    "voteKickId" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "invitedById" TEXT,

    CONSTRAINT "z_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "zKicks" (
    "userId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zKicks_pkey" PRIMARY KEY ("userId","targetId")
);

-- AddForeignKey
ALTER TABLE "z" ADD CONSTRAINT "z_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "z" ADD CONSTRAINT "z_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "z"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zKicks" ADD CONSTRAINT "zKicks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "z"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zKicks" ADD CONSTRAINT "zKicks_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "z"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
