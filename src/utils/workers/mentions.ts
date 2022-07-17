import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import { MentionQueueItem } from "../users/utils";
import ms = require("ms");

declare function require(name: string);

export default function doCollection(array: MentionQueueItem): Promise<any> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(__filename, {
            workerData: [array],
        });
        worker.on("message", resolve);
        worker.on("error", reject);
        worker.on("exit", (code) => {
            if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
        });
    });
}

if (!isMainThread) {
    setTimeout(() => {
        parentPort.postMessage(1);
    }, ms("1 hour"));
    const db = require("better-sqlite3")("./out/data/storage.db", { fileMustExist: true, timeout: 15000 });
    const { encrypt } = require("../functions/string");
    const insertMention = db.prepare(
        "INSERT INTO mentions (guild_id, target_id, date, user_tag, url, content) VALUES (?, ?, ?, ?, ?, ?)"
    );
    const collection = workerData[0];

    const members = collection.members;

    let content = collection.message.content;

    if (content.length > 100) {
        content = content.substr(0, 97) + "...";
    }

    content = content.replace(/(\r\n|\n|\r)/gm, " ");

    content = encrypt(content);

    let channelMembers = collection.channelMembers;

    const a = Array.from(members.keys());

    const interval = setInterval(() => {
        const memberID = a.shift();

        const member = members.get(memberID);

        if (!member) return;
        if (member.user.bot) return;
        if (member.user.id == collection.message.author.id) return;

        try {
            if (!channelMembers.has(memberID)) return;
        } catch {
            channelMembers = channelMembers.cache;
            if (!channelMembers.has(memberID)) return;
        }

        try {
            insertMention.run(
                collection.guildId,
                member.user.id,
                Math.floor(collection.message.createdTimestamp / 1000),
                `${collection.message.author.username}#${collection.message.author.discriminator}`,
                collection.url,
                content
            );
        } catch (e) {
            if (e.code != "SQLITE_BUSY") throw e;
        }

        if (a.length == 0) {
            clearInterval(interval);
            db.close();
            parentPort.postMessage(0);
            process.exit(0);
        }
    }, 50);
}
