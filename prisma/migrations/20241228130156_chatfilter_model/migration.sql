-- CreateTable
CREATE TABLE "ChatFilter" (
    "guildId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "percentMatch" INTEGER,

    CONSTRAINT "ChatFilter_pkey" PRIMARY KEY ("guildId","content")
);

-- AddForeignKey
ALTER TABLE "ChatFilter" ADD CONSTRAINT "ChatFilter_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
