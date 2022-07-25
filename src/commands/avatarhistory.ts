import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    CommandInteraction,
    GuildMember,
    Interaction,
    Message,
    MessageActionRowComponentBuilder,
} from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { formatDate } from "../utils/functions/date";
import { uploadImageToImgur } from "../utils/functions/image";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";
import { addNewAvatar, clearAvatarHistory, deleteAvatar, fetchAvatarHistory, isTracking } from "../utils/users/utils";

const cmd = new Command("avatarhistory", "view a user's avatar history", Categories.INFO).setAliases([
    "avh",
    "avhistory",
    "pfphistory",
    "pfph",
]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    let member: GuildMember;

    if (args.length == 0) {
        member = message.member;
    } else {
        if (args[0].toLowerCase() == "-clear") {
            await clearAvatarHistory(message.member);
            return message.channel.send({
                embeds: [new CustomEmbed(message.member, "✅ your avatar history has been cleared")],
            });
        }
    }

    if (!member) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    await addCooldown(cmd.name, message.member, 15);

    let history = await fetchAvatarHistory(member);

    if (history.length == 0) {
        const url = await uploadImageToImgur(member.user.displayAvatarURL({ extension: "png", size: 256 }));
        if (url) {
            await addNewAvatar(member, url);
            history = await fetchAvatarHistory(member);
        } else {
            return message.channel.send({ embeds: [new ErrorEmbed("no avatar history")] });
        }
    }

    let index = 0;

    if (parseInt(args[1]) - 1) {
        index = parseInt(args[1]) - 1;

        if (!history[index]) index = 0;
    }

    const embed = new CustomEmbed(message.member)
        .setHeader(member.user.tag)
        .setImage(history[index].value)
        .setFooter({ text: formatDate(history[index].date) });

    if (history.length > 1) {
        embed.setFooter({ text: `${formatDate(history[index].date)} | ${index + 1}/${history.length}` });
    }

    if (!(await isTracking(member))) {
        embed.setDescription("`[tracking disabled]`");
    }

    let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("d").setLabel("delete").setStyle(ButtonStyle.Danger)
    );

    let msg: Message;

    if (history.length == 1) {
        return await message.channel.send({ embeds: [embed] });
    } else {
        msg = await message.channel.send({ embeds: [embed], components: [row] });
    }

    let currentPage = index + 1;
    const lastPage = history.length;

    const filter = (i: Interaction) => i.user.id == message.author.id;

    const pageManager = async (): Promise<void> => {
        const reaction = await msg
            .awaitMessageComponent({ filter, time: 30000 })
            .then(async (collected) => {
                await collected.deferUpdate();
                return collected;
            })
            .catch(async () => {
                await msg.edit({ components: [] });
            });

        if (!reaction) return;

        const newEmbed = new CustomEmbed(message.member);

        if (!(await isTracking(member))) {
            newEmbed.setDescription("`[tracking disabled]`");
        }

        if (reaction.customId == "⬅") {
            if (currentPage <= 1) {
                return pageManager();
            } else {
                currentPage--;

                newEmbed.setHeader(member.user.tag);
                newEmbed.setImage(history[currentPage - 1].value);
                newEmbed.setFooter({
                    text: `${formatDate(history[currentPage - 1].date)} | ${currentPage}/${history.length}`,
                });
                if (currentPage == 1) {
                    row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                        new ButtonBuilder()
                            .setCustomId("⬅")
                            .setLabel("back")
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId("➡")
                            .setLabel("next")
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(false),
                        new ButtonBuilder().setCustomId("d").setLabel("delete").setStyle(ButtonStyle.Danger)
                    );
                } else {
                    row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                        new ButtonBuilder()
                            .setCustomId("⬅")
                            .setLabel("back")
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(false),
                        new ButtonBuilder()
                            .setCustomId("➡")
                            .setLabel("next")
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(false),
                        new ButtonBuilder().setCustomId("d").setLabel("delete").setStyle(ButtonStyle.Danger)
                    );
                }
                await msg.edit({ embeds: [newEmbed], components: [row] });
                return pageManager();
            }
        } else if (reaction.customId == "➡") {
            if (currentPage >= lastPage) {
                return pageManager();
            } else {
                currentPage++;

                newEmbed.setHeader(member.user.tag);
                newEmbed.setImage(history[currentPage - 1].value);
                newEmbed.setFooter({
                    text: `${formatDate(history[currentPage - 1].date)} | ${currentPage}/${history.length}`,
                });
                if (currentPage == lastPage) {
                    row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                        new ButtonBuilder()
                            .setCustomId("⬅")
                            .setLabel("back")
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(false),
                        new ButtonBuilder()
                            .setCustomId("➡")
                            .setLabel("next")
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true),
                        new ButtonBuilder().setCustomId("d").setLabel("delete").setStyle(ButtonStyle.Danger)
                    );
                } else {
                    row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                        new ButtonBuilder()
                            .setCustomId("⬅")
                            .setLabel("back")
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(false),
                        new ButtonBuilder()
                            .setCustomId("➡")
                            .setLabel("next")
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(false),
                        new ButtonBuilder().setCustomId("d").setLabel("delete").setStyle(ButtonStyle.Danger)
                    );
                }
                await msg.edit({ embeds: [newEmbed], components: [row] });
                return pageManager();
            }
        } else if (reaction.customId == "d") {
            const res = await deleteAvatar(history[currentPage - 1].id);

            if (res) {
                await reaction.followUp({
                    embeds: [new CustomEmbed(message.member, "✅ successfully deleted this avatar")],
                    ephemeral: true,
                });
            } else {
                await reaction.followUp({
                    embeds: [new CustomEmbed(message.member, "failed to delete this avatar")],
                    ephemeral: true,
                });
            }

            return pageManager();
        }
    };

    return pageManager();
}

cmd.setRun(run);

module.exports = cmd;
