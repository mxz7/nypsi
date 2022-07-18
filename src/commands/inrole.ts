import {
    Collection,
    CommandInteraction,
    GuildMember,
    Message,
    ActionRowBuilder,
    ButtonBuilder,
    Role,
    MessageActionRowComponentBuilder,
    ButtonStyle,
    Interaction,
} from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { inCooldown, addCooldown as addGuildCooldown, getPrefix } from "../utils/guilds/utils";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";

const cmd = new Command("inrole", "get the members in a role", Categories.UTILITY);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    const prefix = await getPrefix(message.guild);

    if (args.length == 0) {
        return message.channel.send({ embeds: [new ErrorEmbed(`${prefix}inrole <role>`)] });
    }

    const roles = message.guild.roles.cache;

    let role: Role;

    if (message.mentions.roles.first()) {
        role = message.mentions.roles.first();
    } else if (args[0].length == 18 && parseInt(args[0])) {
        role = roles.find((r) => r.id == args[0]);
    } else {
        role = roles.find((r) => r.name.toLowerCase().includes(args.join(" ").toLowerCase()));
    }

    if (!role) {
        return message.channel.send({ embeds: [new ErrorEmbed(`couldn't find the role \`${args.join(" ")}\``)] });
    }

    await addCooldown(cmd.name, message.member, 10);

    let members: Collection<string, GuildMember>;

    if (
        inCooldown(message.guild) ||
        message.guild.memberCount == message.guild.members.cache.size ||
        message.guild.memberCount <= 250
    ) {
        members = message.guild.members.cache;
    } else {
        members = await message.guild.members.fetch();

        addGuildCooldown(message.guild, 3600);
    }

    const memberList = new Map();
    let count = 0;

    members.forEach((m) => {
        if (m.roles.cache.has(role.id)) {
            count++;
            if (memberList.size >= 1) {
                const currentPage = memberList.get(memberList.size);

                if (currentPage.length >= 10) {
                    const newPage = ["`" + m.user.tag + "`"];

                    memberList.set(memberList.size + 1, newPage);
                } else {
                    currentPage.push("`" + m.user.tag + "`");

                    memberList.set(memberList.size, currentPage);
                }
            } else {
                const newPage = ["`" + m.user.tag + "`"];

                memberList.set(1, newPage);
            }
        }
    });

    if (!memberList.get(1)) {
        return message.channel.send({
            embeds: [new CustomEmbed(message.member, "that role has no members")],
        });
    }

    const embed = new CustomEmbed(message.member, memberList.get(1).join("\n"))
        .setHeader(role.name + " [" + count.toLocaleString() + "]")
        .setFooter({ text: `page 1/${memberList.size}` });

    let msg: Message;

    let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary)
    );

    if (memberList.size >= 2) {
        msg = await message.channel.send({ embeds: [embed], components: [row] });
    } else {
        return await message.channel.send({ embeds: [embed] });
    }

    if (memberList.size <= 1) return;

    let currentPage = 1;
    const lastPage = memberList.size;

    const filter = (i: Interaction) => i.user.id == message.author.id;

    async function pageManager(): Promise<void> {
        const reaction = await msg
            .awaitMessageComponent({ filter, time: 30000 })
            .then(async (collected) => {
                await collected.deferUpdate();
                return collected.customId;
            })
            .catch(async () => {
                await msg.edit({ components: [] });
            });

        if (!reaction) return;

        if (reaction == "⬅") {
            if (currentPage <= 1) {
                return pageManager();
            } else {
                currentPage--;
                embed.setDescription(memberList.get(currentPage).join("\n"));
                embed.setFooter({ text: `page ${currentPage}/${lastPage}` });
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
                            .setDisabled(false)
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
                            .setDisabled(false)
                    );
                }
                await msg.edit({ embeds: [embed], components: [row] });
                return pageManager();
            }
        } else if (reaction == "➡") {
            if (currentPage == lastPage) {
                return pageManager();
            } else {
                currentPage++;
                embed.setDescription(memberList.get(currentPage).join("\n"));
                embed.setFooter({ text: `page ${currentPage}/${lastPage}` });
                if (currentPage == lastPage) {
                    row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                        new ButtonBuilder()
                            .setCustomId("⬅")
                            .setLabel("back")
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(false),
                        new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary).setDisabled(true)
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
                            .setDisabled(false)
                    );
                }
                await msg.edit({ embeds: [embed], components: [row] });
                return pageManager();
            }
        }
    }
    return pageManager();
}

cmd.setRun(run);

module.exports = cmd;
