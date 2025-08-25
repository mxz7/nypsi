-- CreateTable
CREATE TABLE "public"."GuildMember" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "GuildMember_pkey" PRIMARY KEY ("guildId","userId")
);

-- AddForeignKey
ALTER TABLE "public"."GuildMember" ADD CONSTRAINT "GuildMember_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "public"."Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
