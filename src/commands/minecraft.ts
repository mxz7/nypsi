import { CommandInteraction, Message, MessageActionRow, MessageButton } from "discord.js";
import { getPrefix } from "../utils/guilds/utils";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";
import { getNameHistory } from "mc-names";
import { cleanString } from "../utils/functions/string";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";

const cmd = new Command("minecraft", "view information about a minecraft account", Categories.MINECRAFT).setAliases(["mc"]);

cmd.slashEnabled = true;
cmd.slashData.addStringOption((option) =>
    option.setName("username").setDescription("username to get the name history for").setRequired(true)
);

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
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

    const prefix = await getPrefix(message.guild);

    if (args.length == 0) {
        return send({ embeds: [new ErrorEmbed(`${prefix}minecraft <name/server IP>`)] });
    }

    await addCooldown(cmd.name, message.member, 10);

    let username = cleanString(args[0]);

    const nameHistory = await getNameHistory(username);

    if (!nameHistory) {
        return await send({ embeds: [new ErrorEmbed("invalid account")] });
    }

    const skin = `https://mc-heads.net/avatar/${nameHistory.uuid}/256`;

    username = nameHistory.username;

    const names = nameHistory.toPages(7, "`$username` | `$date`");

    const embed = new CustomEmbed(message.member, names.get(1).join("\n"))
        .setTitle(username)
        .setURL("https://namemc.com/profile/" + username)
        .setThumbnail(skin);

    if (names.size >= 2) {
        embed.setFooter(`page 1/${names.size}`);
    }

    /**
     * @type {Message}
     */
    let msg;

    let row = new MessageActionRow().addComponents(
        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(true),
        new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary)
    );

    if (names.size >= 2) {
        msg = await send({ embeds: [embed], components: [row] });
    } else {
        return await send({ embeds: [embed] });
    }

    if (names.size >= 2) {
        let currentPage = 1;
        const lastPage = names.size;

        const filter = (i) => i.user.id == message.author.id;

        const edit = async (data, msg) => {
            if (!(message instanceof Message)) {
                await message.editReply(data);
                return await message.fetchReply();
            } else {
                return await msg.edit(data);
            }
        };

        const pageManager = async () => {
            const reaction = await msg
                .awaitMessageComponent({ filter, time: 30000, errors: ["time"] })
                .then(async (collected) => {
                    await collected.deferUpdate();
                    return collected.customId;
                })
                .catch(async () => {
                    await edit({ components: [] }, msg);
                });

            if (!reaction) return;

            if (reaction == "⬅") {
                if (currentPage <= 1) {
                    return pageManager();
                } else {
                    currentPage--;
                    embed.setDescription(names.get(currentPage).join("\n"));
                    embed.setFooter("page " + currentPage + "/" + lastPage);
                    if (currentPage == 1) {
                        row = new MessageActionRow().addComponents(
                            new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(true),
                            new ButtonBuilder()
                                .setCustomId("➡")
                                .setLabel("next")
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(false)
                        );
                    } else {
                        row = new MessageActionRow().addComponents(
                            new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(false),
                            new ButtonBuilder()
                                .setCustomId("➡")
                                .setLabel("next")
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(false)
                        );
                    }
                    await edit({ embeds: [embed], components: [row] }, msg);
                    return pageManager();
                }
            } else if (reaction == "➡") {
                if (currentPage >= lastPage) {
                    return pageManager();
                } else {
                    currentPage++;
                    embed.setDescription(names.get(currentPage).join("\n"));
                    embed.setFooter("page " + currentPage + "/" + lastPage);
                    if (currentPage == lastPage) {
                        row = new MessageActionRow().addComponents(
                            new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(false),
                            new ButtonBuilder()
                                .setCustomId("➡")
                                .setLabel("next")
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(true)
                        );
                    } else {
                        row = new MessageActionRow().addComponents(
                            new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(false),
                            new ButtonBuilder()
                                .setCustomId("➡")
                                .setLabel("next")
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(false)
                        );
                    }
                    await edit({ embeds: [embed], components: [row] }, msg);
                    return pageManager();
                }
            }
        };
        return pageManager();
    }
}

cmd.setRun(run);

module.exports = cmd;
