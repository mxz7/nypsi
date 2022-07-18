import {
    getBalance,
    createUser,
    updateBalance,
    userExists,
    formatBet,
    calcMaxBet,
    isEcoBanned,
    addGamble,
} from "../utils/economy/utils.js";
import {
    CommandInteraction,
    Message,
    ActionRowBuilder,
    ButtonBuilder,
    MessageActionRowComponentBuilder,
    ButtonStyle,
    GuildMember,
    Interaction,
} from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";
import { getPrefix } from "../utils/guilds/utils";
import { gamble } from "../utils/logger.js";
import { getMember } from "../utils/functions/member.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler.js";

const waiting: Set<string> = new Set();

const cmd = new Command("coinflip", "flip a coin, double or nothing", Categories.MONEY).setAliases(["cf"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (!(await userExists(message.member))) {
        await createUser(message.member);
    }

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    const prefix = await getPrefix(message.guild);

    if (args.length != 2) {
        const embed = new CustomEmbed(message.member)
            .setHeader("coinflip help")
            .addField("usage", `${prefix}coinflip @user <bet>`)
            .addField("help", "if you win, you will double your bet")
            .addField("example", `${prefix}coinflip @user 100`);

        return message.channel.send({ embeds: [embed] });
    }

    if (waiting.has(message.author.id)) {
        return message.channel.send({
            embeds: [new ErrorEmbed("please wait until your game has been accepted or denied")],
        });
    }

    if (args[0].toLowerCase() == "t") args[0] = "tails";

    if (args[0].toLowerCase() == "h") args[0] = "heads";

    let target: GuildMember;

    if (!message.mentions.members.first()) {
        target = await getMember(message.guild, args[0]);
    } else {
        target = message.mentions.members.first();
    }

    if (!target) {
        return message.channel.send({ embeds: [new ErrorEmbed("unable to find that member")] });
    }

    if (message.member == target) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    if (target.user.bot) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    if (await isEcoBanned(target.user.id)) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    if (!(await userExists(target))) await createUser(target);

    const maxBet = await calcMaxBet(message.member);

    const bet = await formatBet(args[1], message.member);

    if (!bet) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid bet")] });
    }

    if (isNaN(bet)) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid bet")] });
    }

    if (bet <= 0) {
        return message.channel.send({ embeds: [new ErrorEmbed(`${prefix}coinflip @user 100`)] });
    }

    if (bet > (await getBalance(message.member))) {
        return message.channel.send({ embeds: [new ErrorEmbed("you cannot afford this bet")] });
    }

    if (bet > (await getBalance(target))) {
        return message.channel.send({ embeds: [new ErrorEmbed(`**${target.user.tag}** cannot afford this bet`)] });
    }

    const targetMaxBet = await calcMaxBet(target);

    if (bet > maxBet) {
        return message.channel.send({
            embeds: [
                new ErrorEmbed(
                    `your max bet is $**${maxBet.toLocaleString()}**\nyou can upgrade this by prestiging and voting`
                ),
            ],
        });
    }

    if (bet > targetMaxBet) {
        return message.channel.send({
            embeds: [new ErrorEmbed(`**${target.user.tag}**'s max bet is too low for this bet`)],
        });
    }

    waiting.add(message.author.id);

    await updateBalance(message.member, (await getBalance(message.member)) - bet);

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("y").setLabel("accept").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("n").setLabel("deny").setStyle(ButtonStyle.Danger)
    );

    const requestEmbed = new CustomEmbed(
        message.member,
        `**${message.author.tag}** has challenged you to a coinflip\n\n**bet** $${bet.toLocaleString()}\n\ndo you accept?`
    ).setFooter({ text: "expires in 60 seconds" });

    const m = await message.channel.send({
        content: `${target.user.toString()} you have been invited to a coinflip worth $${bet.toLocaleString()}`,
        embeds: [requestEmbed],
        components: [row],
    });

    const filter = (i: Interaction) => i.user.id == target.id;
    let fail = false;

    const response = await m
        .awaitMessageComponent({ filter, time: 60000 })
        .then(async (collected) => {
            await collected.deferUpdate();
            await m.delete();
            return collected.customId;
        })
        .catch(async () => {
            fail = true;
            waiting.delete(message.author.id);
            await updateBalance(message.member, (await getBalance(message.member)) + bet);
            return message.channel.send({ content: message.author.toString() + " coinflip request expired" });
        });

    if (fail) return;

    if (typeof response != "string") return;

    if (response == "y") {
        if (bet > (await getBalance(target))) {
            return message.channel.send({ embeds: [new ErrorEmbed("you cannot afford this bet")] });
        }

        await addCooldown(cmd.name, message.member, 10);

        await updateBalance(target, (await getBalance(target)) - bet);

        // its big to make sure that theres little to no deviation in chance cus of rounding
        const lols = [
            "heads",
            "tails",
            "heads",
            "tails",
            "heads",
            "tails",
            "heads",
            "tails",
            "heads",
            "tails",
            "heads",
            "tails",
            "heads",
            "tails",
            "heads",
            "tails",
            "heads",
            "tails",
            "heads",
            "tails",
            "heads",
            "tails",
            "heads",
            "tails",
            "heads",
            "tails",
            "heads",
            "tails",
        ];
        const choice = lols[Math.floor(Math.random() * lols.length)];
        let thingy = `${message.author.username}\n${target.user.username}`;

        let winner: GuildMember;
        let loser: GuildMember;

        if (choice == "heads") {
            winner = message.member;
            loser = target;
        } else {
            winner = target;
            loser = message.member;
        }

        gamble(winner.user, "coinflip", bet, true, bet * 2);
        gamble(loser.user, "coinflip", bet, false);
        await addGamble(winner, "coinflip", true);
        await addGamble(loser, "coinflip", false);

        await updateBalance(winner, (await getBalance(winner)) + bet * 2);

        waiting.delete(message.author.id);

        const embed = new CustomEmbed(
            message.member,
            `*throwing..*\n\n${thingy}\n\n**bet** $${bet.toLocaleString()}`
        ).setHeader("coinflip");

        return message.channel.send({ embeds: [embed] }).then((msg) => {
            if (winner == message.member) {
                thingy = `**${message.author.username}** +$${bet.toLocaleString()}\n${target.user.username}`;
            } else {
                thingy = `${message.author.username}\n**${target.user.username}** +$${bet.toLocaleString()}`;
            }

            embed.setDescription(`**winner** ${winner.user.tag}\n\n${thingy}\n\n**bet** $${bet.toLocaleString()}`);
            embed.setColor(winner.displayHexColor);

            return setTimeout(() => {
                return msg.edit({ embeds: [embed] });
            }, 2000);
        });
    } else {
        await updateBalance(message.member, (await getBalance(message.member)) + bet);
        waiting.delete(message.author.id);
        return message.channel.send({ embeds: [new CustomEmbed(target, "✅ coinflip request denied")] });
    }
}

cmd.setRun(run);

module.exports = cmd;
