/*
  Warnings:

  - You are about to drop the column `lastKnownTag` on the `User` table. All the data in the column will be lost.
  - Added the required column `lastKnownUsername` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."User" RENAME COLUMN "lastKnownTag" TO "lastKnownUsername";
ALTER TABLE "public"."User" ADD COLUMN "usernameUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 14:21:00 +02:00';
