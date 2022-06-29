import { CommandInteraction, Message } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { getMember } from "../utils/functions/member";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";
import { isPremium, getTier } from "../utils/premium/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";

const cache = new Map();

const cmd = new Command("iq", "accurate prediction of your iq", Categories.FUN);

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("how large is your iq"));

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

    let member;

    if (args.length == 0) {
        member = message.member;
    } else {
        if (!message.mentions.members.first()) {
            member = await getMember(message.guild, args[0]);
        } else {
            member = message.mentions.members.first();
        }

        if (!member) {
            return send({ embeds: [new ErrorEmbed("invalid user")] });
        }
    }

    await addCooldown(cmd.name, message.member, 7);

    let iq;
    let iqMsg;

    if (cache.has(member.user.id)) {
        iq = cache.get(member.user.id);
    } else {
        let chanceAmount = 25;

        if (isPremium(member.user.id)) {
            if (getTier(member.user.id) >= 3) {
                chanceAmount = 10;
            }
        }

        const chance = Math.floor(Math.random() * chanceAmount);

        if (chance == 7) {
            const chance2 = Math.floor(Math.random() * 10);

            if (chance2 > 5) {
                iq = Math.floor(Math.random() * 20);
            } else {
                iq = (Math.floor(Math.random() * 8) + 2) * 100;
            }
        } else if (chance == 6) {
            iq = 69;
        } else if (chance == 5) {
            iq = 420;
        } else {
            iq = Math.floor(Math.random() * 40) + 80;
        }

        cache.set(member.user.id, iq);

        setTimeout(() => {
            cache.delete(member.user.id);
        }, 60 * 1000);
    }

    if (iq == 69) {
        iqMsg = "😉😏🍆🍑";
    } else if (iq < 80) {
        iqMsg = "you're a rock :rock:";
    } else if (iq < 90) {
        iqMsg = "u probably push doors that say pull";
    } else if (iq < 98) {
        iqMsg = "dumbass.. 🤣";
    } else if (iq < 103) {
        iqMsg = "average 🙄";
    } else if (iq < 120) {
        iqMsg = "big brain";
    } else if (iq < 400) {
        iqMsg = "nerd 🤓";
    } else if (iq == 420) {
        iqMsg = "🚬🍁🍂";
    } else {
        iqMsg = "uh. woah.";
    }

    const embed = new CustomEmbed(message.member, false, `${member.user.toString()}\n\n**${iq}** IQ 🧠\n${iqMsg}`).setHeader(
        "iq calculator",
        member.user.avatarURL()
    );

    return send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
