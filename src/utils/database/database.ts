import { PrismaClient } from "@prisma/client";
import Database = require("better-sqlite3");

const prisma = new PrismaClient();

export default prisma;

const db = new Database("./out/data/mentions.db");

db.prepare(
    "CREATE TABLE IF NOT EXISTS mentions ('guild_id' TEXT NOT NULL, 'target_id' TEXT NOT NULL, 'date' INTEGER NOT NULL, 'user_tag' TEXT NOT NULL, 'url' TEXT NOT NULL, 'content' TEXT NOT NULL)"
).run();

db.close();
