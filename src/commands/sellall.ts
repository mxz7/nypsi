import { CommandInteraction, InteractionReplyOptions, Message, MessageOptions } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import {
    createUser,
    getBalance,
    getInventory,
    getItems,
    getMulti,
    setInventory,
    updateBalance,
    userExists,
} from "../utils/economy/utils";
import { addToNypsiBank, getTax } from "../utils/functions/tax";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("sellall", "sell all commonly sold items", Categories.MONEY);

cmd.slashEnabled = true;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (!(await userExists(message.member))) await createUser(message.member);

    const send = async (data: MessageOptions | InteractionReplyOptions) => {
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
            return await message.channel.send(data as MessageOptions);
        }
    };

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return send({ embeds: [embed], ephemeral: true });
    }

    const items = getItems();

    const inventory = await getInventory(message.member);

    const selected = new Map<string, number>();

    for (const item of Array.from(Object.keys(inventory))) {
        if (items[item].role == "fish" || items[item].role == "prey" || items[item].role == "sellable") {
            if (items[item].id == "cookie" || items[item].id == "cake") continue;
            selected.set(item, inventory[item]);
        } else if (items[item].id.includes("watch") || items[item].id == "calendar") {
            selected.set(item, inventory[item]);
        }
    }

    if (selected.size == 0) {
        return send({ embeds: [new ErrorEmbed("you do not have anything to sell")] });
    }

    await addCooldown(cmd.name, message.member, 30);

    const multi = await getMulti(message.member);

    let total = 0;
    let taxedAmount = 0;
    let earned = "";

    const tax = await getTax();

    for (const item of selected.keys()) {
        delete inventory[item];

        let sellWorth = Math.floor(items[item].sell * selected.get(item));

        if (items[item].role == "fish" || items[item].role == "prey" || items[item].role == "sellable") {
            sellWorth = Math.floor(sellWorth + sellWorth * multi);
        }

        taxedAmount += Math.floor(sellWorth * tax);
        sellWorth = sellWorth - Math.floor(sellWorth * tax);
        total += sellWorth;

        earned += `\n${items[item].emoji} ${items[item].name} +$${sellWorth.toLocaleString()} (${selected.get(item)})`;
    }

    await setInventory(message.member, inventory);

    await addToNypsiBank(taxedAmount);

    await updateBalance(message.member, (await getBalance(message.member)) + total);

    const embed = new CustomEmbed(message.member);

    embed.setDescription(`+$**${total.toLocaleString()}**\n${earned}`);
    embed.setFooter({ text: `${((await getTax()) * 100).toFixed(1)}% tax` });

    return send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
