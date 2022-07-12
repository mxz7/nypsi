import { isPremium, getTier } from "../utils/premium/utils";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { BaseGuildTextChannel, Collection, CommandInteraction, Message } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";

const cmd = new Command("delp", "bulk delete/purge your own messages", Categories.MODERATION).setAliases(["dp", "d"]);

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    let amount = 25;

    if (await isPremium(message.author.id)) {
        if ((await getTier(message.author.id)) == 4) {
            amount = 100;
        } else {
            amount = 50;
        }
    }

    await addCooldown(cmd.name, message.member, 20);

    let collected: Collection<string, Message>;

    if (amount == 25) {
        collected = await message.channel.messages.fetch({ limit: 25 });
    } else {
        collected = await message.channel.messages.fetch({ limit: 100 });
    }

    collected = collected.filter((msg) => {
        if (!msg.author) return;
        return msg.author.id == message.author.id;
    });

    if (collected.size == 0) {
        return;
    }

    if (collected.size > amount) {
        const collectedValues = Array.from(collected.values());

        collectedValues.splice(amount + 1, collectedValues.length);

        collected = new Collection();

        for (const msg of collectedValues) {
            collected.set(msg.id, msg);
        }
    }

    if (!(message.channel instanceof BaseGuildTextChannel || message.channel.type == "GUILD_PUBLIC_THREAD")) return;

    await message.channel.bulkDelete(collected).catch(() => {});
}

cmd.setRun(run);

module.exports = cmd;
