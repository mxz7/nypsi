-- CreateTable
CREATE TABLE "AiChatConversation" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "AiChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiChatMessage" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversationId" INTEGER NOT NULL,
    "userQuery" TEXT NOT NULL,
    "aiResponse" TEXT,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "cachedInputTokens" INTEGER,
    "outputTokens" INTEGER,

    CONSTRAINT "AiChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiChatMessage_conversationId_idx" ON "AiChatMessage"("conversationId");

-- AddForeignKey
ALTER TABLE "AiChatConversation" ADD CONSTRAINT "AiChatConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiChatMessage" ADD CONSTRAINT "AiChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
