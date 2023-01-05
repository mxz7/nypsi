-- CreateTable
CREATE TABLE "UserAlias" (
    "userId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "command" TEXT NOT NULL,

    CONSTRAINT "UserAlias_pkey" PRIMARY KEY ("userId","alias")
);

-- AddForeignKey
ALTER TABLE "UserAlias" ADD CONSTRAINT "UserAlias_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Premium"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
