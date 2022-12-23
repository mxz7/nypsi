-- CreateEnum
CREATE TYPE "WorkerDmSetting" AS ENUM ('Disabled', 'All', 'OnlyWhenFull');

-- CreateEnum
CREATE TYPE "ReactionRoleMode" AS ENUM ('MANY', 'UNIQUE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "lastKnownTag" TEXT NOT NULL,
    "karma" INTEGER NOT NULL DEFAULT 1,
    "lastCommand" TIMESTAMP(3) NOT NULL,
    "tracking" BOOLEAN NOT NULL DEFAULT true,
    "lastfmUsername" TEXT,
    "email" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DMSettings" (
    "userId" TEXT NOT NULL,
    "rob" BOOLEAN NOT NULL DEFAULT true,
    "lottery" BOOLEAN NOT NULL DEFAULT true,
    "premium" BOOLEAN NOT NULL DEFAULT true,
    "auction" BOOLEAN NOT NULL DEFAULT true,
    "vote" BOOLEAN NOT NULL DEFAULT true,
    "vote_reminder" BOOLEAN NOT NULL DEFAULT false,
    "worker" "WorkerDmSetting" NOT NULL DEFAULT 'OnlyWhenFull',
    "booster" BOOLEAN NOT NULL DEFAULT false,
    "payment" BOOLEAN NOT NULL DEFAULT true,
    "other" BOOLEAN NOT NULL DEFAULT true,
    "net_worth" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DMSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "CommandUse" (
    "userId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "uses" INTEGER NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "Achievements" (
    "userId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "progress" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Achievements_pkey" PRIMARY KEY ("userId","achievementId")
);

-- CreateTable
CREATE TABLE "Economy" (
    "money" BIGINT NOT NULL DEFAULT 500,
    "bank" BIGINT NOT NULL DEFAULT 9500,
    "bankStorage" BIGINT NOT NULL DEFAULT 5000,
    "net_worth" BIGINT NOT NULL DEFAULT 0,
    "defaultBet" INTEGER,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "prestige" INTEGER NOT NULL DEFAULT 0,
    "padlock" BOOLEAN NOT NULL DEFAULT false,
    "lastDaily" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 14:21:00 +02:00',
    "lastVote" TIMESTAMP(3) NOT NULL,
    "dailyStreak" INTEGER NOT NULL DEFAULT 0,
    "banned" TIMESTAMP(3),
    "auction_watch" TEXT[],
    "userId" TEXT NOT NULL,

    CONSTRAINT "Economy_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Crafting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "finished" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Crafting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inventory" (
    "userId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "EconomyWorker" (
    "userId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "stored" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EconomyWorker_pkey" PRIMARY KEY ("userId","workerId")
);

-- CreateTable
CREATE TABLE "EconomyWorkerUpgrades" (
    "userId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "upgradeId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "EconomyWorkerUpgrades_pkey" PRIMARY KEY ("userId","workerId","upgradeId")
);

-- CreateTable
CREATE TABLE "LotteryTicket" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "LotteryTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booster" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "boosterId" TEXT NOT NULL,
    "expire" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EconomyStats" (
    "type" TEXT NOT NULL,
    "win" BIGINT NOT NULL DEFAULT 0,
    "lose" BIGINT NOT NULL DEFAULT 0,
    "gamble" BOOLEAN NOT NULL,
    "economyUserId" TEXT NOT NULL,

    CONSTRAINT "EconomyStats_pkey" PRIMARY KEY ("type","economyUserId")
);

-- CreateTable
CREATE TABLE "Premium" (
    "level" INTEGER NOT NULL,
    "embedColor" TEXT NOT NULL DEFAULT 'default',
    "lastWeekly" TIMESTAMP(3) NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 1,
    "startDate" TIMESTAMP(3) NOT NULL,
    "expireDate" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Premium_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "PremiumCommand" (
    "owner" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "uses" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PremiumCommand_pkey" PRIMARY KEY ("owner")
);

-- CreateTable
CREATE TABLE "Username" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'username',
    "value" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Username_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordleStats" (
    "win1" INTEGER NOT NULL DEFAULT 0,
    "win2" INTEGER NOT NULL DEFAULT 0,
    "win3" INTEGER NOT NULL DEFAULT 0,
    "win4" INTEGER NOT NULL DEFAULT 0,
    "win5" INTEGER NOT NULL DEFAULT 0,
    "win6" INTEGER NOT NULL DEFAULT 0,
    "lose" INTEGER NOT NULL DEFAULT 0,
    "history" INTEGER[],
    "userId" TEXT NOT NULL,

    CONSTRAINT "WordleStats_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Auction" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "itemAmount" INTEGER NOT NULL DEFAULT 1,
    "bin" BIGINT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL,
    "peak" INTEGER NOT NULL DEFAULT 0,
    "disabledCommands" TEXT[],
    "snipeFilter" TEXT[],
    "chatFilter" TEXT[],
    "percentMatch" INTEGER NOT NULL DEFAULT 75,
    "prefix" TEXT NOT NULL DEFAULT '$',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "slash_only" BOOLEAN NOT NULL DEFAULT false,
    "auto_role" TEXT[],
    "persist_role" TEXT[],

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReactionRole" (
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT NOT NULL,
    "whitelist" TEXT[],
    "mode" "ReactionRoleMode" NOT NULL
);

-- CreateTable
CREATE TABLE "ReactionRoleRoles" (
    "messageId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReactionRoleRoles_pkey" PRIMARY KEY ("messageId","roleId")
);

-- CreateTable
CREATE TABLE "RolePersist" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "roles" TEXT[],

    CONSTRAINT "RolePersist_pkey" PRIMARY KEY ("guildId","userId")
);

-- CreateTable
CREATE TABLE "GuildChristmas" (
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "format" TEXT NOT NULL DEFAULT '`%days%` days until christmas',
    "channel" TEXT NOT NULL DEFAULT '',
    "guildId" TEXT NOT NULL,

    CONSTRAINT "GuildChristmas_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "GuildCounter" (
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "format" TEXT NOT NULL DEFAULT 'members: %count% (%peak%)',
    "filterBots" BOOLEAN NOT NULL DEFAULT false,
    "channel" TEXT NOT NULL DEFAULT '',
    "guildId" TEXT NOT NULL,

    CONSTRAINT "GuildCounter_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "GuildCountdown" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "format" TEXT NOT NULL,
    "finalFormat" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,

    CONSTRAINT "GuildCountdown_pkey" PRIMARY KEY ("guildId","id")
);

-- CreateTable
CREATE TABLE "Moderation" (
    "caseCount" INTEGER NOT NULL DEFAULT 0,
    "muteRole" TEXT,
    "modlogs" TEXT,
    "logs" TEXT,
    "automute" INTEGER[] DEFAULT ARRAY[0, 60, 120, 300]::INTEGER[],
    "guildId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ModerationBan" (
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "expire" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationBan_pkey" PRIMARY KEY ("userId","guildId")
);

-- CreateTable
CREATE TABLE "ModerationMute" (
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "expire" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationMute_pkey" PRIMARY KEY ("userId","guildId")
);

-- CreateTable
CREATE TABLE "ModerationCase" (
    "caseId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "user" TEXT NOT NULL,
    "moderator" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ModerationCase_pkey" PRIMARY KEY ("caseId","guildId")
);

-- CreateTable
CREATE TABLE "ChatReaction" (
    "wordList" TEXT[],
    "randomStart" BOOLEAN NOT NULL DEFAULT false,
    "randomChannels" TEXT[],
    "betweenEvents" INTEGER NOT NULL DEFAULT 600,
    "randomModifier" INTEGER NOT NULL DEFAULT 300,
    "timeout" INTEGER NOT NULL DEFAULT 60,
    "blacklisted" TEXT[],
    "guildId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ChatReactionStats" (
    "userId" TEXT NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "second" INTEGER NOT NULL DEFAULT 0,
    "third" INTEGER NOT NULL DEFAULT 0,
    "chatReactionGuildId" TEXT NOT NULL,

    CONSTRAINT "ChatReactionStats_pkey" PRIMARY KEY ("chatReactionGuildId","userId")
);

-- CreateTable
CREATE TABLE "EconomyGuild" (
    "guildName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "motd" TEXT NOT NULL DEFAULT 'welcome to the guild fool (/guild motd)',
    "ownerId" TEXT NOT NULL,

    CONSTRAINT "EconomyGuild_pkey" PRIMARY KEY ("guildName")
);

-- CreateTable
CREATE TABLE "EconomyGuildMember" (
    "userId" TEXT NOT NULL,
    "guildName" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "contributedMoney" BIGINT NOT NULL DEFAULT 0,
    "contributedXp" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EconomyGuildMember_pkey" PRIMARY KEY ("userId","guildName")
);

-- CreateTable
CREATE TABLE "WholesomeImage" (
    "id" SERIAL NOT NULL,
    "image" TEXT NOT NULL,
    "submitter" TEXT NOT NULL,
    "submitterId" TEXT NOT NULL,
    "uploadDate" TIMESTAMP(3) NOT NULL,
    "accepterId" TEXT NOT NULL,

    CONSTRAINT "WholesomeImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WholesomeSuggestion" (
    "id" SERIAL NOT NULL,
    "image" TEXT NOT NULL,
    "submitter" TEXT NOT NULL,
    "submitterId" TEXT NOT NULL,
    "uploadDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WholesomeSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mention" (
    "guildId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "userTag" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "Mention_pkey" PRIMARY KEY ("url")
);

-- CreateTable
CREATE TABLE "SupportRequest" (
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,

    CONSTRAINT "SupportRequest_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "KofiPurchases" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "item" TEXT NOT NULL,

    CONSTRAINT "KofiPurchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CommandUse_userId_command_key" ON "CommandUse"("userId", "command");

-- CreateIndex
CREATE INDEX "Inventory_userId_item_idx" ON "Inventory"("userId", "item");

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_userId_item_key" ON "Inventory"("userId", "item");

-- CreateIndex
CREATE UNIQUE INDEX "PremiumCommand_trigger_key" ON "PremiumCommand"("trigger");

-- CreateIndex
CREATE UNIQUE INDEX "Auction_messageId_key" ON "Auction"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "ReactionRole_messageId_key" ON "ReactionRole"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "GuildChristmas_guildId_key" ON "GuildChristmas"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "GuildCounter_guildId_key" ON "GuildCounter"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "Moderation_guildId_key" ON "Moderation"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatReaction_guildId_key" ON "ChatReaction"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "EconomyGuild_ownerId_key" ON "EconomyGuild"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "EconomyGuildMember_userId_key" ON "EconomyGuildMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WholesomeImage_image_key" ON "WholesomeImage"("image");

-- CreateIndex
CREATE UNIQUE INDEX "WholesomeSuggestion_image_key" ON "WholesomeSuggestion"("image");

-- CreateIndex
CREATE INDEX "Mention_guildId_idx" ON "Mention" USING HASH ("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportRequest_channelId_key" ON "SupportRequest"("channelId");

-- AddForeignKey
ALTER TABLE "DMSettings" ADD CONSTRAINT "DMSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommandUse" ADD CONSTRAINT "CommandUse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Achievements" ADD CONSTRAINT "Achievements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Economy" ADD CONSTRAINT "Economy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Crafting" ADD CONSTRAINT "Crafting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomyWorker" ADD CONSTRAINT "EconomyWorker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomyWorkerUpgrades" ADD CONSTRAINT "EconomyWorkerUpgrades_userId_workerId_fkey" FOREIGN KEY ("userId", "workerId") REFERENCES "EconomyWorker"("userId", "workerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotteryTicket" ADD CONSTRAINT "LotteryTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booster" ADD CONSTRAINT "Booster_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomyStats" ADD CONSTRAINT "EconomyStats_economyUserId_fkey" FOREIGN KEY ("economyUserId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Premium" ADD CONSTRAINT "Premium_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PremiumCommand" ADD CONSTRAINT "PremiumCommand_owner_fkey" FOREIGN KEY ("owner") REFERENCES "Premium"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Username" ADD CONSTRAINT "Username_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordleStats" ADD CONSTRAINT "WordleStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReactionRole" ADD CONSTRAINT "ReactionRole_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReactionRoleRoles" ADD CONSTRAINT "ReactionRoleRoles_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ReactionRole"("messageId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePersist" ADD CONSTRAINT "RolePersist_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildChristmas" ADD CONSTRAINT "GuildChristmas_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildCounter" ADD CONSTRAINT "GuildCounter_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildCountdown" ADD CONSTRAINT "GuildCountdown_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Moderation" ADD CONSTRAINT "Moderation_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationBan" ADD CONSTRAINT "ModerationBan_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Moderation"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationMute" ADD CONSTRAINT "ModerationMute_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Moderation"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Moderation"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReaction" ADD CONSTRAINT "ChatReaction_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReactionStats" ADD CONSTRAINT "ChatReactionStats_chatReactionGuildId_fkey" FOREIGN KEY ("chatReactionGuildId") REFERENCES "ChatReaction"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomyGuild" ADD CONSTRAINT "EconomyGuild_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomyGuildMember" ADD CONSTRAINT "EconomyGuildMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomyGuildMember" ADD CONSTRAINT "EconomyGuildMember_guildName_fkey" FOREIGN KEY ("guildName") REFERENCES "EconomyGuild"("guildName") ON DELETE CASCADE ON UPDATE CASCADE;
