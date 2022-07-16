import { CommandInteraction, Message } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders";
import { startOpeningCrates, stopOpeningCrates } from "../utils/commandhandler";
import { getInventory, getItems, openCrate, getDMsEnabled } from "../utils/economy/utils";
import { getPrefix } from "../utils/guilds/utils";
import { isPremium, getTier } from "../utils/premium/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";

const cmd = new Command("opencrates", "open all of your crates with one command", Categories.MONEY);

cmd.slashEnabled = true;

/**
 *
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    const send = async (data) => {
        if (!(message instanceof Message)) {
            await message.reply(data);
            const replyMsg = await message.fetchReply();
            if (replyMsg instanceof Message) {
                return replyMsg;
            }
        } else {
            return await message.channel.send(data);
        }
    };

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return send({ embeds: [embed] });
    }

    if (!(await getDMsEnabled(message.member))) {
        return send({
            embeds: [new ErrorEmbed(`you must have dms enabled. ${await getPrefix(message.guild)}dms`)],
        });
    }

    const inventory = await getInventory(message.member);
    const items = getItems();

    const crates = [];

    let max = 5;
    let hitMax = false;

    if (await isPremium(message.member)) {
        if ((await getTier(message.member)) >= 3) {
            max = 20;
        } else {
            max = 10;
        }
    }

    for (const item of Array.from(Object.keys(inventory))) {
        if (items[item].role == "crate") {
            let amount = 0;
            while (amount < inventory[item]) {
                amount++;
                crates.push(item);
                if (crates.length >= max) {
                    hitMax = true;
                    break;
                }
            }
        }
    }

    if (crates.length == 0) {
        return send({ embeds: [new ErrorEmbed("you dont have any crates to open")] });
    }

    startOpeningCrates(message.member);

    await addCooldown(cmd.name, message.member, 120);

    const embed = new CustomEmbed(message.member);

    embed.setTitle("opening crates");

    let desc = `opening ${crates.length} crates${hitMax ? " (limited)" : ""}`;

    embed.setDescription(desc);

    desc += "\n\nyou found:\n";

    let fail = false;

    const msg = await message.member.send({ embeds: [embed] }).catch(() => {
        fail = true;
    });

    if (fail || !(msg instanceof Message)) {
        const reply = new ErrorEmbed("failed to dm you, please check your privacy settings");
        if (message.interaction) {
            return send({ embeds: [reply], ephemeral: true });
        } else {
            return send({ embeds: [reply] });
        }
    } else {
        const reply = new CustomEmbed(message.member, "✅ check your dms");
        if (message.interaction) {
            await send({ embeds: [reply], ephemeral: true });
        } else {
            await send({ embeds: [reply] });
        }
    }

    const interval = setInterval(async () => {
        let finished = false;
        const crate = crates.shift();

        const found = await openCrate(message.member, items[crate]);

        desc += ` - ${found.join("\n - ")}\n`;

        if (crates.length == 0) {
            desc += "\n\nfinished (:";
            finished = true;
        }

        embed.setDescription(desc);

        msg.edit({ embeds: [embed] });

        if (finished) {
            clearInterval(interval);
            stopOpeningCrates(message.member);
        }
    }, 1500);
}

cmd.setRun(run);

module.exports = cmd;
