-- CreateTable
CREATE TABLE "_PreferencesNew" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "_PreferencesNew_pkey" PRIMARY KEY ("userId", "key")
);

-- Migrate non-default personal preferences into sparse key-value rows.
INSERT INTO "_PreferencesNew" ("userId", "key", "value")
SELECT p."userId", 'duelRequests', to_jsonb(p."duelRequests")
FROM "Preferences" p
WHERE p."duelRequests" IS DISTINCT FROM true
UNION ALL
SELECT p."userId", 'offers', to_jsonb(p."offers")
FROM "Preferences" p
WHERE p."offers" IS DISTINCT FROM 3
UNION ALL
SELECT p."userId", 'leaderboards', to_jsonb(p."leaderboards")
FROM "Preferences" p
WHERE p."leaderboards" IS DISTINCT FROM true
UNION ALL
SELECT p."userId", 'tips', to_jsonb(p."tips")
FROM "Preferences" p
WHERE p."tips" IS DISTINCT FROM true
UNION ALL
SELECT p."userId", 'marketConfirm', to_jsonb(p."marketConfirm")
FROM "Preferences" p
WHERE p."marketConfirm" IS DISTINCT FROM 25000000
UNION ALL
SELECT p."userId", 'marketDelay', to_jsonb(p."marketDelay")
FROM "Preferences" p
WHERE p."marketDelay" IS DISTINCT FROM 300
UNION ALL
SELECT p."userId", 'mentionsGlobal', to_jsonb(p."mentionsGlobal")
FROM "Preferences" p
WHERE p."mentionsGlobal" IS DISTINCT FROM false
UNION ALL
SELECT p."userId", 'sudokuCoordMode', to_jsonb(p."sudokuCoordMode"::text)
FROM "Preferences" p
WHERE p."sudokuCoordMode" IS DISTINCT FROM 'box';

-- Migrate non-default DM preferences using their namespaced keys.
INSERT INTO "_PreferencesNew" ("userId", "key", "value")
SELECT d."userId", 'dms.rob', to_jsonb(d."rob")
FROM "DMSettings" d
WHERE d."rob" IS DISTINCT FROM true
UNION ALL
SELECT d."userId", 'dms.lottery', to_jsonb(d."lottery")
FROM "DMSettings" d
WHERE d."lottery" IS DISTINCT FROM true
UNION ALL
SELECT d."userId", 'dms.premium', to_jsonb(d."premium")
FROM "DMSettings" d
WHERE d."premium" IS DISTINCT FROM true
UNION ALL
SELECT d."userId", 'dms.market', to_jsonb(d."market")
FROM "DMSettings" d
WHERE d."market" IS DISTINCT FROM true
UNION ALL
SELECT d."userId", 'dms.voteReminder', to_jsonb(d."voteReminder")
FROM "DMSettings" d
WHERE d."voteReminder" IS DISTINCT FROM false
UNION ALL
SELECT d."userId", 'dms.worker', to_jsonb(d."worker"::text)
FROM "DMSettings" d
WHERE d."worker" IS DISTINCT FROM 'OnlyWhenFull'
UNION ALL
SELECT d."userId", 'dms.booster', to_jsonb(d."booster")
FROM "DMSettings" d
WHERE d."booster" IS DISTINCT FROM false
UNION ALL
SELECT d."userId", 'dms.payment', to_jsonb(d."payment")
FROM "DMSettings" d
WHERE d."payment" IS DISTINCT FROM true
UNION ALL
SELECT d."userId", 'dms.other', to_jsonb(d."other")
FROM "DMSettings" d
WHERE d."other" IS DISTINCT FROM true
UNION ALL
SELECT d."userId", 'dms.netWorth', to_jsonb(d."netWorth")
FROM "DMSettings" d
WHERE d."netWorth" IS DISTINCT FROM 0
UNION ALL
SELECT d."userId", 'dms.autosellStatus', to_jsonb(d."autosellStatus")
FROM "DMSettings" d
WHERE d."autosellStatus" IS DISTINCT FROM true
UNION ALL
SELECT d."userId", 'dms.level', to_jsonb(d."level"::text)
FROM "DMSettings" d
WHERE d."level" IS DISTINCT FROM 'OnlyReward'
UNION ALL
SELECT d."userId", 'dms.farmHealth', to_jsonb(d."farmHealth")
FROM "DMSettings" d
WHERE d."farmHealth" IS DISTINCT FROM true;

-- Replace the legacy tables after their data has been copied.
DROP TABLE "DMSettings";
DROP TABLE "Preferences";

ALTER TABLE "_PreferencesNew" RENAME TO "Preferences";
ALTER TABLE "Preferences" RENAME CONSTRAINT "_PreferencesNew_pkey" TO "Preferences_pkey";

-- AddForeignKey
ALTER TABLE "Preferences" ADD CONSTRAINT "Preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropEnum
DROP TYPE "LevelDmSetting";

-- DropEnum
DROP TYPE "SudokuCoordMode";

-- DropEnum
DROP TYPE "WorkerDmSetting";
