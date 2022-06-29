import { getMember } from "../utils/functions/member";
import {
    userExists,
    updateBalance,
    createUser,
    getBalance,
    hasPadlock,
    setPadlock,
    getXp,
    updateXp,
    getDMsEnabled,
    hasVoted,
    isEcoBanned,
    addRob,
    getInventory,
    setInventory,
    addItemUse,
    getGuildByUser,
} from "../utils/economy/utils.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";
import { getPrefix } from "../utils/guilds/utils";
import { CommandInteraction, Message } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import redis from "../utils/database/redis";

const playerCooldown = new Set();

const cmd = new Command("rob", "rob other server members", Categories.MONEY).setAliases(["steal"]);

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("who do u wanna rob").setRequired(true));

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

    if ((await redis.exists(`cd:rob-radio:${message.author.id}`)) == 1) {
        const init = parseInt(await redis.get(`cd:rob-radio:${message.author.id}`));
        const curr = new Date();
        const diff = Math.round((curr.getTime() - init) / 1000);
        const time = 900 - diff;

        const minutes = Math.floor(time / 60);
        const seconds = time - minutes * 60;

        let remaining: string;

        if (minutes != 0) {
            remaining = `${minutes}m${seconds}s`;
        } else {
            remaining = `${seconds}s`;
        }
        return send({
            embeds: [
                new ErrorEmbed(
                    `you have been reported to the police, they will continue looking for you for **${remaining}**`
                ),
            ],
        });
    }

    const prefix = getPrefix(message.guild);

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member)
            .setHeader("rob help")
            .addField("usage", `${prefix}rob <@user>`)
            .addField(
                "help",
                "robbing a user is a useful way for you to make money\nyou can steal a maximum of **40**% of their balance\n" +
                    "but there is also a chance that you get caught by the police or just flat out failing the robbery\n" +
                    "you can lose up to **25**% of your balance by failing a robbery"
            );

        return send({ embeds: [embed] });
    }

    if (!(await userExists(message.member))) createUser(message.member);

    if (message.guild.id == "747056029795221513") {
        return send({ embeds: [new ErrorEmbed("this has been disabled in the support server")] });
    }

    let target = message.mentions.members.first();

    if (!target) {
        target = await getMember(message.guild, args[0]);
    }

    if (!target) {
        return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    if (target.user.bot) {
        return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    if (isEcoBanned(target.user.id)) {
        return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    if (message.member == target) {
        return send({ embeds: [new ErrorEmbed("you cant rob yourself")] });
    }

    if (!(await userExists(target)) || getBalance(target) <= 500) {
        return send({ embeds: [new ErrorEmbed("this user doesnt have sufficient funds")] });
    }

    const targetGuild = getGuildByUser(target);

    if (targetGuild) {
        if (targetGuild.guild_name == getGuildByUser(message.member)?.guild_name) {
            return send({ embeds: [new ErrorEmbed("you cannot rob someone in your own guild")] });
        }
    }

    if (getBalance(message.member) < 750) {
        return send({ embeds: [new ErrorEmbed("you need $750 in your wallet to rob someone")] });
    }

    await addCooldown(cmd.name, message.member, 700);

    const embed = new CustomEmbed(message.member, true, "robbing " + target.user.toString() + "..").setHeader(
        "robbery",
        message.author.avatarURL()
    );

    const embed2 = new CustomEmbed(message.member, true, "robbing " + target.user.toString() + "..").setHeader(
        "robbery",
        message.author.avatarURL()
    );

    const embed3 = new CustomEmbed().setFooter("use $optout to optout of bot dms");

    let robberySuccess = false;

    if (playerCooldown.has(target.user.id)) {
        const amount = Math.floor(Math.random() * 9) + 1;
        const amountMoney = Math.round(getBalance(message.member) * (amount / 100));

        updateBalance(target, getBalance(target) + amountMoney);
        updateBalance(message.member, getBalance(message.member) - amountMoney);

        embed2.setColor("#e4334f");
        embed2.addField(
            "**fail!!**",
            "**" +
                target.user.tag +
                "** has been robbed recently and is protected by a private security team\n" +
                "you were caught and paid $" +
                amountMoney.toLocaleString()
        );

        embed3.setTitle("you were nearly robbed");
        embed3.setColor("#5efb8f");
        embed3.setDescription(
            "**" +
                message.member.user.tag +
                "** tried to rob you in **" +
                message.guild.name +
                "**\n" +
                "since you have been robbed recently, you are protected by a private security team.\nyou have been given $**" +
                amountMoney.toLocaleString() +
                "**"
        );
    } else if (hasPadlock(target)) {
        setPadlock(target, false);

        const amount = Math.floor(Math.random() * 35) + 5;
        const amountMoney = Math.round(getBalance(target) * (amount / 100));

        embed2.setColor("#e4334f");
        embed2.addField("fail!!", "**" + target.user.tag + "** had a padlock, which has now been broken");

        embed3.setTitle("you were nearly robbed");
        embed3.setColor("#5efb8f");
        embed3.setDescription(
            "**" +
                message.member.user.tag +
                "** tried to rob you in **" +
                message.guild.name +
                "**\n" +
                "your padlock has saved you from a robbery, but it has been broken\nthey would have stolen $**" +
                amountMoney.toLocaleString() +
                "**"
        );
    } else {
        const chance = Math.floor(Math.random() * 22);

        if (chance > 8) {
            robberySuccess = true;

            const amount = Math.floor(Math.random() * 35) + 5;
            const amountMoney = Math.round(getBalance(target) * (amount / 100));

            updateBalance(target, getBalance(target) - amountMoney);
            updateBalance(message.member, getBalance(message.member) + amountMoney);

            embed2.setColor("#5efb8f");
            embed2.addField("success!!", "you stole $**" + amountMoney.toLocaleString() + "**");

            const voted = await hasVoted(message.member);

            if (voted) {
                updateXp(message.member, getXp(message.member) + 1);
                embed2.setFooter("+1xp");
            }

            embed3.setTitle("you have been robbed");
            embed3.setColor("#e4334f");
            embed3.setDescription(
                "**" +
                    message.member.user.tag +
                    "** has robbed you in **" +
                    message.guild.name +
                    "**\n" +
                    "they stole a total of $**" +
                    amountMoney.toLocaleString() +
                    "**"
            );

            playerCooldown.add(target.user.id);

            const length = Math.floor(Math.random() * 30) + 30;

            setTimeout(() => {
                playerCooldown.delete(target.user.id);
            }, length * 1000);
        } else {
            const amount = Math.floor(Math.random() * 20) + 5;
            const amountMoney = Math.round(getBalance(message.member) * (amount / 100));

            const inventory = getInventory(message.member);

            if (inventory["lawyer"] && inventory["lawyer"] > 0) {
                addItemUse(message.member, "lawyer");
                inventory["lawyer"]--;

                if (inventory["lawyer"] == 0) {
                    delete inventory["lawyer"];
                }

                setInventory(message.member, inventory);

                embed2.addField(
                    "fail!!",
                    `you were caught by the police, but your lawyer stopped you from losing any money\nyou would have lost $${amountMoney.toLocaleString()}`
                );
                embed3.setDescription(
                    "**" +
                        message.member.user.tag +
                        "** tried to rob you in **" +
                        message.guild.name +
                        "**\n" +
                        "they were caught by the police, but a lawyer protected their money"
                );
            } else {
                updateBalance(target, getBalance(target) + amountMoney);
                updateBalance(message.member, getBalance(message.member) - amountMoney);
                embed2.addField("fail!!", "you lost $**" + amountMoney.toLocaleString() + "**");
                embed3.setDescription(
                    "**" +
                        message.member.user.tag +
                        "** tried to rob you in **" +
                        message.guild.name +
                        "**\n" +
                        "they were caught by the police and you received $**" +
                        amountMoney.toLocaleString() +
                        "**"
                );
            }

            embed2.setColor("#e4334f");

            embed3.setTitle("you were nearly robbed");
            embed3.setColor("#5efb8f");
        }
    }

    const edit = async (data, msg) => {
        if (!(message instanceof Message)) {
            await message.editReply(data);
            return await message.fetchReply();
        } else {
            return await msg.edit(data);
        }
    };

    send({ embeds: [embed] }).then(async (m) => {
        setTimeout(async () => {
            await edit({ embeds: [embed2] }, m);

            if (await getDMsEnabled(target)) {
                if (robberySuccess) {
                    addRob(message.member, true);
                    target.send({ content: "you have been robbed!!", embeds: [embed3] }).catch(() => {});
                } else {
                    addRob(message.member, false);
                    target.send({ content: "you were nearly robbed!!", embeds: [embed3] }).catch(() => {});
                }
            }
        }, 1500);
    });
}

cmd.setRun(run);

module.exports = cmd;
