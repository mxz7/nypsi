import { CommandInteraction, InteractionReplyOptions, Message, MessageEditOptions, MessageOptions } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders";
import { userExists, createUser, getInventory, getItems, addItemUse, setInventory } from "../utils/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";

const cmd = new Command("smelt", "smelt your ores into ingots with coal", Categories.MONEY);

cmd.slashEnabled = true;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (!(await userExists(message.member))) await createUser(message.member);

    const send = async (data: MessageOptions) => {
        if (!(message instanceof Message)) {
            if (message.deferred) {
                await message.editReply(data);
            } else {
                await message.reply(data as InteractionReplyOptions);
            }
            const replyMsg = await message.fetchReply();
            if (replyMsg instanceof Message) {
                return replyMsg;
            }
        } else {
            return await message.channel.send(data);
        }
    };

    if (!(message instanceof Message)) {
        await message.deferReply();
    }

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return send({ embeds: [embed] });
    }

    const inventory = await getInventory(message.member);
    const items = getItems();

    let hasFurnace = false;
    let coal = 0;
    const ores = [];

    if (inventory["furnace"] && inventory["furnace"] > 0) {
        hasFurnace = true;
    }

    if (!hasFurnace) {
        return send({
            embeds: [new ErrorEmbed("you need a furnace to smelt ore. furnaces can be found in crates")],
        });
    }

    if (inventory["iron_ore"] && inventory["iron_ore"] > 0) {
        for (let i = 0; i < inventory["iron_ore"]; i++) {
            ores.push("iron_ore");
            if (ores.length >= 64) break;
        }
    }

    if (inventory["gold_ore"] && inventory["gold_ore"] > 0 && ores.length < 64) {
        for (let i = 0; i < inventory["gold_ore"]; i++) {
            ores.push("gold_ore");
            if (ores.length >= 64) break;
        }
    }

    if (ores.length == 0) {
        return send({
            embeds: [new ErrorEmbed("you need ore to smelt. ore can be found in crates and through mining")],
        });
    }

    if (inventory["coal"] && inventory["coal"] > 0) {
        coal = inventory["coal"];

        if (coal > ores.length) coal = ores.length;
    }

    if (coal == 0) {
        return send({
            embeds: [new ErrorEmbed("you need coal to smelt ore. coal can be found in crates and through mining")],
        });
    }

    await addCooldown(cmd.name, message.member, 600);

    await addItemUse(message.member, "furnace");

    const smelted = new Map();

    for (const ore of ores) {
        if (smelted.has(ore)) {
            smelted.set(ore, smelted.get(ore) + 1);
        } else {
            smelted.set(ore, 1);
        }
    }

    let res = "";

    for (const ore of Array.from(smelted.keys())) {
        inventory[ore] -= smelted.get(ore);

        if (inventory[ore] <= 0) delete inventory[ore];

        const ingot = items[ore].ingot;

        res += `\n${smelted.get(ore)} ${items[ingot].emoji} ${items[ingot].name}`;

        if (inventory[ingot]) {
            inventory[ingot] += smelted.get(ore);
        } else {
            inventory[ingot] = smelted.get(ore);
        }
    }

    inventory["coal"] -= coal;
    inventory["furnace"] -= 1;

    if (inventory["coal"] <= 0) delete inventory["coal"];
    if (inventory["furnace"] <= 0) delete inventory["furnace"];

    await setInventory(message.member, inventory);

    const embed = new CustomEmbed(message.member);
    embed.setHeader("furnace", message.author.avatarURL());
    embed.setDescription("<:nypsi_furnace_lit:959445186847584388> smelting...");

    const msg = await send({ embeds: [embed] });

    const edit = async (data: MessageEditOptions, msg: Message) => {
        if (!(message instanceof Message)) {
            await message.editReply(data);
            return await message.fetchReply();
        } else {
            return await msg.edit(data);
        }
    };

    setTimeout(() => {
        embed.setDescription(`<:nypsi_furnace:959445132585869373> you have smelted: \n${res}`);
        edit({ embeds: [embed] }, msg);
    }, 2000);
}

cmd.setRun(run);

module.exports = cmd;
