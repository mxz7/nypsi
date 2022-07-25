import { Mention } from "@prisma/client";
import { isMainThread, parentPort, Worker, workerData } from "worker_threads";
import prisma from "../database/database";
import { encrypt } from "../functions/string";
import { MentionQueueItem } from "../users/utils";
import ms = require("ms");

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
    let currentData: Mention[] = [];
    let inserting = false;

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

    const interval = setInterval(async () => {
        if (inserting) return;

        if (currentData.length >= 500) {
            inserting = true;
            await prisma.mention.createMany({
                data: currentData,
                skipDuplicates: true,
            });
            currentData = [];
            inserting = false;
        }

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

        currentData.push({
            guildId: collection.guildId,
            targetId: member.user.id,
            date: new Date(collection.message.createdTimestamp),
            url: collection.url,
            content: content,
            userTag: `${collection.message.author.username}#${collection.message.author.discriminator}`,
        });

        if (a.length == 0) {
            if (currentData.length > 0) {
                inserting = true;
                await prisma.mention.createMany({
                    data: currentData,
                    skipDuplicates: true,
                });
                currentData = [];
                inserting = false;
            }

            clearInterval(interval);
            parentPort.postMessage(0);
            process.exit(0);
        }
    }, 25);
}
