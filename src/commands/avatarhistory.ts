import { CommandInteraction, GuildMember, Message, MessageActionRow, MessageButton } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders";
import { fetchAvatarHistory, addNewAvatar, clearAvatarHistory, isTracking } from "../utils/users/utils";
import { uploadImageToImgur } from "../utils/functions/image";
import { formatDate } from "../utils/functions/date";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";

const cmd = new Command("avatarhistory", "view a user's avatar history", Categories.INFO).setAliases([
    "avh",
    "avhistory",
    "pfphistory",
    "pfph",
]);

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
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
        const url = await uploadImageToImgur(member.user.displayAvatarURL({ format: "png", dynamic: true, size: 256 }));
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
        .setHeader(`${member.user.tag} [${index + 1}]`)
        .setImage(history[index].value)
        .setFooter(formatDate(history[index].date));

    if (history.length > 1) {
        embed.setFooter(`${formatDate(history[index].date)} | ${index + 1}/${history.length}`);
    }

    if (!(await isTracking(member))) {
        embed.setDescription("`[tracking disabled]`");
    }

    let row = new MessageActionRow().addComponents(
        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(true),
        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY")
    );

    /**
     * @type {Message}
     */
    let msg;

    if (history.length == 1) {
        return await message.channel.send({ embeds: [embed] });
    } else {
        msg = await message.channel.send({ embeds: [embed], components: [row] });
    }

    let currentPage = index + 1;
    const lastPage = history.length;

    const filter = (i) => i.user.id == message.author.id;

    const pageManager = async () => {
        const reaction = await msg
            .awaitMessageComponent({ filter, time: 30000, errors: ["time"] })
            .then(async (collected) => {
                await collected.deferUpdate();
                return collected.customId;
            })
            .catch(async () => {
                await msg.edit({ components: [] });
            });

        if (!reaction) return;

        const newEmbed = new CustomEmbed(message.member);

        if (!(await isTracking(member))) {
            newEmbed.setDescription("`[tracking disabled]`");
        }

        if (reaction == "⬅") {
            if (currentPage <= 1) {
                return pageManager();
            } else {
                currentPage--;

                newEmbed.setHeader(`${member.user.tag} [${currentPage}]`);
                newEmbed.setImage(history[currentPage - 1].value);
                newEmbed.setFooter(`${formatDate(history[currentPage - 1].date)} | ${currentPage}/${history.length}`);
                if (currentPage == 1) {
                    row = new MessageActionRow().addComponents(
                        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(true),
                        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(false)
                    );
                } else {
                    row = new MessageActionRow().addComponents(
                        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(false),
                        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(false)
                    );
                }
                await msg.edit({ embeds: [newEmbed], components: [row] });
                return pageManager();
            }
        } else if (reaction == "➡") {
            if (currentPage >= lastPage) {
                return pageManager();
            } else {
                currentPage++;

                newEmbed.setHeader(`${member.user.tag} [${currentPage}]`);
                newEmbed.setImage(history[currentPage - 1].value);
                newEmbed.setFooter(`${formatDate(history[currentPage - 1].date)} | ${currentPage}/${history.length}`);
                if (currentPage == lastPage) {
                    row = new MessageActionRow().addComponents(
                        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(false),
                        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(true)
                    );
                } else {
                    row = new MessageActionRow().addComponents(
                        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(false),
                        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(false)
                    );
                }
                await msg.edit({ embeds: [newEmbed], components: [row] });
                return pageManager();
            }
        }
    };

    return pageManager();
}

cmd.setRun(run);

module.exports = cmd;
