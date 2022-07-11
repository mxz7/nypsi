import { CommandInteraction, Message } from "discord.js";
import { updateXp, getXp, userExists, createUser } from "../utils/economy/utils.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders";
import { getMember } from "../utils/functions/member.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler.js";

const cache = new Map();

const cmd = new Command("furry", "measure how much of a furry you are", Categories.FUN).setAliases([
    "howfurry",
    "stfufurry",
]);

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("is this dude a furry"));

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

    await addCooldown(cmd.name, message.member, 7);

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

    if (!(await userExists(member))) createUser(member);

    let furryAmount;

    if (cache.has(member.user.id)) {
        furryAmount = cache.get(member.user.id);
    } else {
        furryAmount = Math.ceil(Math.random() * 101) - 1;

        cache.set(member.user.id, furryAmount);

        setTimeout(() => {
            if (cache.has(member.user.id)) {
                cache.delete(member.user.id);
            }
        }, 60 * 1000);
    }

    let furryText = "";
    let furryEmoji = "";

    if (furryAmount >= 85) {
        furryEmoji = "🐶🍆💦🧎‍♂️😋";
        furryText = "fucking cumfurry bet u work at a doggy daycare";
    } else if (furryAmount >= 70) {
        furryEmoji = "🐱🍆💦💦";
        furryText = "you've got a furry suit collection and go to cosplay conventions";
    } else if (furryAmount >= 50) {
        furryEmoji = "👉🐈💦";
        furryText = "stop looking at the cat";
    } else if (furryAmount >= 30) {
        furryEmoji = "💻🐕🐩";
        furryText = "i've seen your search history...";
    } else if (furryAmount >= 25) {
        furryEmoji = "😾";
        furryText = "STOP DONT DO IT DONT BUY THE FURRY SUIT";
    } else if (furryAmount >= 15) {
        furryEmoji = "🐈🐕";
        furryText = "you be thinking about the wrong things";
    } else if (furryAmount >= 7) {
        furryEmoji = "👍⁉";
        furryText = "you're normal. i hope.";
    } else {
        furryEmoji = "👍";
        furryText = "you're normal, thank you. have 1 xp";

        if (cache.has(member.user.id)) {
            cache.delete(member.user.id);
            await updateXp(member, (await getXp(member)) + 1);
        }
    }

    const embed = new CustomEmbed(
        message.member,
        false,
        `${member.user.toString()}\n**${furryAmount}**% furry ${furryEmoji}\n${furryText}`
    ).setHeader("furry detector 5000", member.user.avatarURL());

    if (furryAmount < 7) {
        embed.setFooter("+1xp");
    }

    return await send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
