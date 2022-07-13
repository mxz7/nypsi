import { CommandInteraction, Message } from "discord.js";
import redis from "../utils/database/redis";
import { createUser, deleteUser, getBalance, updateBalance } from "../utils/economy/utils";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders.js";

const cmd = new Command(
    "ping",
    "measured by timing how long it takes for a message to be sent - rate limiting can affect this",
    Categories.INFO
).setAliases(["latency"]);

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

    now = Date.now();
    createUser("user_test");
    updateBalance("user_test", getBalance("user_test") + 1000);
    deleteUser("user_test");
    after = Date.now();

    const dbLatency = after - now;

    now = Date.now();
    const msg = await message.channel.send({ content: "pong" });
    after = Date.now();

    const msgLatency = after - now;

    const discordLatency = Math.round(message.client.ws.ping);

    const embed = new CustomEmbed(message.member, false);

    embed.setDescription(
        `discord api \`${discordLatency}ms\`\n` +
            `bot message \`${msgLatency}ms\`\n` +
            `redis \`${redisLatency}ms\`\n` +
            `database \`${dbLatency}ms\``
    );

    return await msg.edit({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
