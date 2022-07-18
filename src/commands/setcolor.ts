import { CommandInteraction, Message } from "discord.js";
import { getPrefix } from "../utils/guilds/utils";
import { isPremium, getTier, getEmbedColor, setEmbedColor } from "../utils/premium/utils";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("setcolor", "set the color of the bot's messages (premium only)", Categories.UTILITY).setAliases([
    "setcolour",
]);

/**
 * @param {Message} message
 * @param {string[]} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (!(await isPremium(message.author.id))) {
        return message.channel.send({
            embeds: [new ErrorEmbed("you must be a BRONZE tier patreon for this command\n\nhttps://www.patreon.com/nypsi")],
        });
    }

    if ((await getTier(message.author.id)) < 1) {
        return message.channel.send({
            embeds: [
                new ErrorEmbed(
                    "you must be atleast BRONZE tier for this command, you are BRONZE\n\nhttps://www.patreon.com/nypsi"
                ),
            ],
        });
    }

    const prefix = await getPrefix(message.guild);

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member);

        embed.setDescription(`**color** #${await getEmbedColor(
            message.author.id
        )}\n\nuse \`${prefix}setcolor <hex color code>\` to change this
        you can use ${prefix}color to find a color, or an [online color picker tool](https://color.tekoh.net)`);

        return message.channel.send({ embeds: [embed] });
    }

    let color = args[0].split("#").join("");

    if (color.toLowerCase() == "reset") color = "default";

    if (color.length > 6 && color != "default") {
        color = color.substr(0, 6);
    }

    if (!color.startsWith("#")) color = `#${color}`;

    const embed = new CustomEmbed();

    try {
        if (color != "default") {
            // @ts-expect-error hate colours lol ):<
            embed.setColor(color);
        }
    } catch {
        return message.channel.send({
            embeds: [new ErrorEmbed("invalid color, please use a hex color ([color.tekoh.net](https://color.tekoh.net))")],
        });
    }

    await setEmbedColor(message.author.id, color);

    return message.channel.send({
        embeds: [
            new CustomEmbed(message.member, `your color has been updated to **${await getEmbedColor(message.author.id)}**`),
        ],
    });
}

cmd.setRun(run);

module.exports = cmd;
