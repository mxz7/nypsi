import { EmbedBuilder, WebhookClient } from "discord.js";
import { inPlaceSort } from "fast-sort";
import { parentPort } from "worker_threads";
import prisma from "../../database/database";

(async () => {
    const baltop = await topAmountGlobal(10, true);

    const embed = new EmbedBuilder();

    embed.setTitle("top 10 richest users");
    embed.setDescription(baltop.join("\n"));
    embed.setColor("#111111");

    const hook = new WebhookClient({ url: process.env.TOPGLOBAL_HOOK });

    await hook
        .send({ embeds: [embed] })
        .then(() => {
            parentPort.postMessage("sent global baltop");
            process.exit(0);
        })
        .catch(() => {
            parentPort.postMessage("failed to send global baltop");
            process.exit(1);
        });
})();

async function topAmountGlobal(amount: number, anon = true): Promise<string[]> {
    const query = await prisma.economy.findMany({
        where: {
            money: { gt: 1000 },
        },
        select: {
            userId: true,
            money: true,
            user: {
                select: {
                    lastKnownTag: true,
                },
            },
        },
    });

    const userIDs: string[] = [];
    const balances: Map<string, number> = new Map();
    const usernames: Map<string, string> = new Map();

    for (const user of query) {
        userIDs.push(user.userId);
        balances.set(user.userId, Number(user.money));
        usernames.set(user.userId, user.user.lastKnownTag);
    }

    inPlaceSort(userIDs).desc((i) => balances.get(i));

    const usersFinal = [];

    let count = 0;

    for (const user of userIDs) {
        if (count >= amount) break;
        if (usersFinal.join().length >= 1500) break;

        if (balances.get(user) != 0) {
            let pos: number | string = count + 1;

            if (pos == 1) {
                pos = "🥇";
            } else if (pos == 2) {
                pos = "🥈";
            } else if (pos == 3) {
                pos = "🥉";
            }

            let username = usernames.get(user);

            if (anon) {
                username = username.split("#")[0];
            }

            usersFinal[count] = pos + " **" + username + "** $" + balances.get(user).toLocaleString();
            count++;
        }
    }
    return usersFinal;
}
