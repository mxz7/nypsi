-- CreateIndex
CREATE INDEX "Crafting_userId_idx" ON "Crafting"("userId");

-- CreateIndex
CREATE INDEX "CustomCar_userId_idx" ON "CustomCar"("userId");

-- CreateIndex
CREATE INDEX "PremiumCommand_trigger_idx" ON "PremiumCommand"("trigger");

-- CreateIndex
CREATE INDEX "ReactionRole_messageId_idx" ON "ReactionRole"("messageId");

-- CreateIndex
CREATE INDEX "TradeRequest_ownerId_idx" ON "TradeRequest"("ownerId");

-- CreateIndex
CREATE INDEX "Username_userId_idx" ON "Username"("userId");
