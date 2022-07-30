import { CommandInteraction, InteractionReplyOptions, Message, MessageOptions } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler.js";
import { createUser, getInventory, getItems, topAmountItem, userExists } from "../utils/economy/utils.js";
import { getPrefix } from "../utils/guilds/utils.js";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { Item } from "../utils/models/Economy.js";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders.js";
import _ = require("lodash");

const cmd = new Command("itemtop", "view top item amounts in the server", Categories.MONEY).setAliases(["itop", "topitem"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
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

    if (!(await userExists(message.member))) await createUser(message.member);

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return send({ embeds: [embed] });
    }

    await addCooldown(cmd.name, message.member, 15);

    const items = getItems();
    let item: Item;
    const prefix = await getPrefix(message.guild);

    if (args.length == 0) {
        const inventory = await getInventory(message.member);

        if (_.isEmpty(inventory)) {
            return send({ embeds: [new ErrorEmbed(`${prefix}itop <item>`)] });
        }

        item = items[Object.keys(inventory)[Math.floor(Math.random() * Object.keys(inventory).length)]];
    } else {
        const searchTag = args.join(" ");

        for (const itemName of Array.from(Object.keys(items))) {
            const aliases = items[itemName].aliases ? items[itemName].aliases : [];
            if (searchTag == itemName) {
                item = items[itemName];
                break;
            } else if (searchTag == itemName.split("_").join("")) {
                item = items[itemName];
                break;
            } else if (aliases.indexOf(searchTag) != -1) {
                item = items[itemName];
                break;
            } else if (searchTag == items[itemName].name) {
                item = items[itemName];
                break;
            }
        }
    }

    if (!item) {
        return send({ embeds: [new ErrorEmbed("invalid item")] });
    }

    const balTop = await topAmountItem(message.guild, 5, item.id);

    const filtered = balTop.filter(function (el) {
        return el != null;
    });

    if (filtered.length == 0) {
        return send({ embeds: [new ErrorEmbed(`there are no users to show for ${item.name}`)] });
    }

    const embed = new CustomEmbed(message.member)
        .setHeader(`top ${filtered.length} ${item.name} holders`)
        .setDescription(filtered.join("\n"));

    send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
