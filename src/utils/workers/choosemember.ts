import { Collection, GuildMember } from "discord.js";
import { isMainThread, parentPort, Worker, workerData } from "worker_threads";

export default function chooseMember(members: Collection<string, GuildMember>, targetName: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(__filename, {
            workerData: [members, targetName],
        });
        worker.on("message", resolve);
        worker.on("error", reject);
        worker.on("exit", (code) => {
            if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
        });
    });
}

if (!isMainThread) {
    let target: GuildMember;
    const possible = new Map<number, GuildMember>();
    const members: Collection<string, GuildMember> = workerData[0];
    const memberName: string = workerData[1];

    for (const m of members.keys()) {
        const member = members.get(m);

        const tag = (member.user.username + "#" + member.user.discriminator).toLowerCase();

        if (member.user.id == memberName) {
            target = member;
            break;
        } else if (tag == memberName.toLowerCase()) {
            target = member;
            break;
        } else if (member.user.username.toLowerCase() == memberName.toLowerCase()) {
            if (member.user.bot) {
                possible.set(2, member);
            } else {
                target = member;
                break;
            }
        } else if (tag.includes(memberName.toLowerCase())) {
            if (member.user.bot) {
                possible.set(3, member);
            } else {
                possible.set(1, member);
            }
        }

        if (possible.size == 3) break;
    }

    if (!target) {
        if (possible.get(1)) {
            target = possible.get(1);
        } else if (possible.get(2)) {
            target = possible.get(2);
        } else if (possible.get(3)) {
            target = possible.get(3);
        } else {
            target = null;
        }
    }

    if (!target) {
        parentPort.postMessage(null);
    } else {
        parentPort.postMessage(target.user.id);
    }
}
