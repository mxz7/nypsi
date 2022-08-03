import { CommandInteraction, Message, MessageOptions, InteractionReplyOptions } from "discord.js";
import { createUser, setDefaultBet, getDefaultBet, userExists, calcMaxBet, formatNumber } from "../utils/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { getPrefix } from "../utils/guilds/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("defaultBet", "set your default bet", Categories.MONEY).setAliases(["preset"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (!(await userExists(message.member))) await createUser(message.member);


    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

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

    const prefix = await getPrefix(message.guild);

    if (args.length == 0) {
        if ((await getDefaultBet(message.member)) == 0) {
            const embed = new CustomEmbed(message.member).setHeader("defaultbet", message.author.avatarURL());

            embed.setDescription(`${prefix}**defaultBet <amount/reset>** *set your default bet for games*`);

            return send({ embeds: [embed] });
        } else {
            const embed = new CustomEmbed(message.member).setHeader("defaultbet", message.author.avatarURL());

            embed.setDescription(`Your default bet is **$${(await getDefaultBet(message.member)).toLocaleString()}**` + 
            `\nuse ${prefix}**defaultBet <amount/reset>** to change this`);

            return send({ embeds: [embed] });
        }
    }

    if (args[0].toLocaleLowerCase() == "reset") {
        setDefaultBet(message.member, 0);

        const embed = new CustomEmbed(message.member);

        embed.setDescription(":white_check_mark: default bet has been reset!");

        return send({ embeds: [embed] });
    }





    const maxBet = await calcMaxBet(message.member);

    const bet = formatNumber(args[0]);


    if (!bet) {
        return send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (bet <= 0) {
        return send({ embeds: [new ErrorEmbed("Your default bet must be greater than 0.")] });
    }

    if (bet > maxBet) {
        return send({
            embeds: [
                new ErrorEmbed(
                    `your max bet is $**${maxBet.toLocaleString()}**\nyou can upgrade this by prestiging and voting`
                ),
            ],
        });
    }

    
    await addCooldown(cmd.name, message.member, 60);

    setDefaultBet(message.member, bet);

    const embed = new CustomEmbed(message.member);

    embed.setDescription(`:white_check_mark: default bet has been set to $${bet.toLocaleString()}!`);

    return send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
