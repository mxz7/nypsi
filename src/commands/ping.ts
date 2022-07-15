import { CommandInteraction, Message } from "discord.js";
import prisma from "../utils/database/database";
import redis from "../utils/database/redis";
import { createUser, deleteUser, getBalance, updateBalance } from "../utils/economy/utils";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders.js";

const cmd = new Command(
    "ping",
    "measured by timing how long it takes for a message to be sent - rate limiting can affect this",
    Categories.INFO
).setAliases(["latency"]);

let pingingDb = false;

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    /**
     * not perfect latency testing i know but it works!!
     */
    let now = Date.now();
    await redis.set("ping:test", "ping ping ping");
    await redis.del("ping:test");
    let after = Date.now();

    const redisLatency = after - now;

    let dbLatency: number;

    if (!pingingDb) {
        pingingDb = true;
        now = Date.now();
        await prisma.user.create({
            data: {
                id: "test_user",
                lastKnownTag: "",
                lastCommand: new Date(),
            },
        });
        await createUser("user_test");
        await updateBalance("user_test", (await getBalance("user_test")) + 1000);
        await deleteUser("user_test");
        await prisma.user.delete({
            where: {
                id: "test_user",
            },
        });
        after = Date.now();
        pingingDb = false;

        dbLatency = after - now;
    }

    now = Date.now();
    const msg = await message.channel.send({ content: "pong" });
    after = Date.now();

    const msgLatency = after - now;

    const discordLatency = Math.round(message.client.ws.ping);

    const embed = new CustomEmbed(message.member, false);

    let desc = `discord api \`${discordLatency}ms\`\n` + `bot message \`${msgLatency}ms\`\n` + `redis \`${redisLatency}ms\``;

    if (dbLatency) {
        desc += `\ndatabase \`${dbLatency}ms\``;
    }

    embed.setDescription(desc);

    return await msg.edit({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
