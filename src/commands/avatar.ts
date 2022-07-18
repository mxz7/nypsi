import { CommandInteraction, GuildMember, Message, MessageActionRow, MessageButton } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { getMember } from "../utils/functions/member";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";

const avatar = new Command("avatar", "get a person's avatar", Categories.INFO);

avatar.setAliases(["av", "pfp", "picture"]);

avatar.slashEnabled = true;

avatar.slashData.addUserOption((option) =>
    option.setName("user").setDescription("view avatar of this user").setRequired(false)
);

/**
 * @param {Message} message
 * @param {string[]} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    let member: GuildMember;

    if (args.length == 0) {
        member = message.member;
    } else {
        if (!message.mentions.members.first()) {
            member = await getMember(message.guild, args.join(" "));
        } else {
            member = message.mentions.members.first();
        }
    }

    if (!member) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    const avatar = member.user.displayAvatarURL({ dynamic: true, size: 256 });

    let serverAvatar = member.displayAvatarURL({ dynamic: true, size: 256 });

    if (avatar == serverAvatar) {
        serverAvatar = undefined;
    }

    const row = new MessageActionRow().addComponents(
        new MessageButton().setCustomId("x").setLabel("show server avatar").setStyle("PRIMARY")
    );

    const embed = new CustomEmbed(member).setHeader(member.user.tag).setImage(avatar);

    let msg;

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

    if (serverAvatar) {
        msg = await send({ embeds: [embed], components: [row] });
    } else {
        return send({ embeds: [embed] });
    }

    const edit = async (data) => {
        if (!(message instanceof Message)) {
            await msg.editReply(data);
            const replyMsg = await message.fetchReply();
            if (replyMsg instanceof Message) {
                return replyMsg;
            }
        } else {
            return await msg.edit(data);
        }
    };

    const filter = (i) => i.user.id == message.author.id;

    const reaction = await msg
        .awaitMessageComponent({ filter, time: 15000, errors: ["time"] })
        .then(async (collected) => {
            await collected.deferUpdate();
            return collected.customId;
        })
        .catch(async () => {
            await edit({ components: [] });
        });

    if (reaction == "x") {
        embed.setImage(serverAvatar);

        await edit({ embeds: [embed], components: [] });
    }
}

avatar.setRun(run);

module.exports = avatar;
