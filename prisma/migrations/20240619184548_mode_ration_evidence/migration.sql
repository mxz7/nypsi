-- CreateTable
CREATE TABLE "ModerationEvidence" (
    "id" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL,
    "caseId" INTEGER NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildEvidenceCredit" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bytes" BIGINT NOT NULL,

    CONSTRAINT "GuildEvidenceCredit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModerationEvidence_caseId_guildId_key" ON "ModerationEvidence"("caseId", "guildId");

-- AddForeignKey
ALTER TABLE "ModerationEvidence" ADD CONSTRAINT "ModerationEvidence_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationEvidence" ADD CONSTRAINT "ModerationEvidence_caseId_guildId_fkey" FOREIGN KEY ("caseId", "guildId") REFERENCES "ModerationCase"("caseId", "guildId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationEvidence" ADD CONSTRAINT "ModerationEvidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildEvidenceCredit" ADD CONSTRAINT "GuildEvidenceCredit_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
