-- CreateTable
CREATE TABLE "AiChatMessage" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "userQuery" TEXT NOT NULL,
    "aiResponse" TEXT,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "cachedInputTokens" INTEGER,
    "outputTokens" INTEGER,

    CONSTRAINT "AiChatMessage_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AiChatMessage" ADD CONSTRAINT "AiChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
