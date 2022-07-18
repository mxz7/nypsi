import { CommandInteraction, Message } from "discord.js";
import { getPrefix } from "../utils/guilds/utils";
import {
    isPremium,
    getPremiumProfile,
    setTier,
    setEmbedColor,
    setStatus,
    addMember,
    renewUser,
    expireUser,
    getUserCommand,
    setExpireDate,
} from "../utils/premium/utils";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders";
import { daysAgo, daysUntil, formatDate } from "../utils/functions/date";
import dayjs = require("dayjs");

const cmd = new Command("premium", "view your premium status", Categories.INFO).setAliases(["patreon", "donate"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    const defaultMessage = async () => {
        if (await isPremium(message.member)) {
            const embed = new CustomEmbed(message.member);

            embed.setHeader("premium status", message.author.avatarURL());

            const profile = await getPremiumProfile(message.member);

            const timeStarted = formatDate(profile.startDate);
            const timeAgo = daysAgo(profile.startDate);
            const expires = formatDate(profile.expireDate);
            const timeUntil = daysUntil(profile.expireDate);
            const embedColor = profile.embedColor;

            let description = `**tier** ${profile.getLevelString()}\n**started** ${timeStarted} (${timeAgo} days ago)\n**expires** ${expires} (${timeUntil} days left)`;

            description += `\n\n**color** ${embedColor} - ${await getPrefix(message.guild)}setcolor`;

            if (profile.level > 2) {
                const cmd = await getUserCommand(message.author.id);
                description += `\n**custom command** ${cmd ? cmd.content : "none"}`;
            }

            if (profile.level < 4) {
                description += "\n\nyou can upgrade your tier at https://www.patreon.com/nypsi";
            }

            embed.setDescription(description);
            embed.setFooter({ text: "thank you so much for supporting!" });

            return message.channel.send({ embeds: [embed] });
        } else {
            const embed = new CustomEmbed(
                message.member,
                "you currently have no premium membership, this is what helps keep nypsi running, any donations are massively greatful :heart:"
            );

            embed.addField(
                "payment methods",
                "[ko-fi](https://ko-fi.com/tekoh/tiers)\n[patreon](https://patreon.com/nypsi)\n\n" +
                    "if you'd like to pay another way (crypto, paypal) join the [support server](https://discord.gg/hJTDNST)"
            );

            return message.channel.send({ embeds: [embed] });
        }
    };

    if (args.length == 0) {
        return defaultMessage();
    } else if (args[0].toLowerCase() == "check" || args[0].toLowerCase() == "status") {
        if (message.author.id != "672793821850894347") {
            return defaultMessage();
        }

        if (args.length == 1) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid syntax bro")] });
        }

        const user = await message.client.users.fetch(args[1]);

        if (!user) return message.channel.send({ embeds: [new ErrorEmbed("user doesnt exist")] });

        if (await isPremium(user.id)) {
            const embed = new CustomEmbed(message.member);

            embed.setHeader(`premium status of ${user.id}`);

            const profile = await getPremiumProfile(user.id);

            const timeStarted = formatDate(profile.startDate);
            const timeAgo = daysAgo(profile.startDate);
            const expires = formatDate(profile.expireDate);
            const timeUntil = daysUntil(profile.expireDate);

            let description = `**tier** ${profile.getLevelString()}\n**started** ${timeStarted} (${timeAgo} days ago)\n**expires** ${expires} (${timeUntil} days left)`;

            if (profile.level > 2) {
                const cmd = await getUserCommand(user.id);
                description += `\n**custom command** ${cmd ? cmd.content : "none"}`;
            }

            embed.setDescription(description);

            return message.channel.send({ embeds: [embed] });
        } else {
            const embed = new CustomEmbed(message.member, "no premium membership");

            return message.channel.send({ embeds: [embed] });
        }
    } else if (args[0].toLowerCase() == "update") {
        if (message.author.id != "672793821850894347") {
            return defaultMessage();
        }

        if (args.length < 4) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid syntax bro")] });
        }

        if (!(await isPremium(args[2]))) {
            return message.channel.send({
                embeds: [
                    new ErrorEmbed(
                        "this user does not have a profile, use $premium add dumbass check it before u update it"
                    ),
                ],
            });
        }

        const expire = (await getPremiumProfile(args[2])).expireDate;
        let date: dayjs.Dayjs;

        switch (args[1].toLowerCase()) {
            case "level":
                await setTier(args[2], parseInt(args[3]));
                return message.channel.send({
                    embeds: [new CustomEmbed(message.member, `✅ tier changed to ${args[3]}`)],
                });
            case "embed":
                await setEmbedColor(args[2], args[3]);
                return message.channel.send({
                    embeds: [new CustomEmbed(message.member, `✅ embed color changed to ${args[3]}`)],
                });
            case "status":
                await setStatus(args[2], parseInt(args[3]));
                return message.channel.send({
                    embeds: [new CustomEmbed(message.member, `✅ status changed to ${args[3]}`)],
                });
            case "adddays":
                date = dayjs(expire);

                date = date.add(parseInt(args[3]), "days");

                await setExpireDate(args[2], date.toDate());
                return message.channel.send({
                    embeds: [new CustomEmbed(message.member, `✅ expire date changed to ${date.toDate()}`)],
                });
            case "remdays":
                date = dayjs(expire);

                date = date.subtract(parseInt(args[3]), "days");

                await setExpireDate(args[2], date.toDate());
                return message.channel.send({
                    embeds: [new CustomEmbed(message.member, `✅ expire date changed to ${date.toDate()}`)],
                });
        }
    } else if (args[0].toLowerCase() == "add") {
        if (message.author.id != "672793821850894347") {
            return defaultMessage();
        }

        if (args.length < 3) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid syntax bro")] });
        }

        await addMember(args[1], parseInt(args[2]));

        return message.channel.send({
            embeds: [new CustomEmbed(message.member, "✅ created profile at tier " + args[2])],
        });
    } else if (args[0].toLowerCase() == "renew") {
        if (message.author.id != "672793821850894347") {
            return defaultMessage();
        }

        if (args.length != 2) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid syntax bro")] });
        }

        await renewUser(args[1]);

        return message.channel.send({ embeds: [new CustomEmbed(message.member, "✅ membership renewed")] });
    } else if (args[0].toLowerCase() == "expire") {
        if (message.author.id != "672793821850894347") {
            return defaultMessage();
        }

        if (args.length != 2) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid syntax bro")] });
        }

        expireUser(args[1]);

        return message.channel.send({ embeds: [new CustomEmbed(message.member, "✅ membership expired")] });
    }
}

cmd.setRun(run);

module.exports = cmd;
