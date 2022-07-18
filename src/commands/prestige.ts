import {
    CommandInteraction,
    Message,
    ActionRowBuilder,
    ButtonBuilder,
    MessageActionRowComponentBuilder,
    ButtonStyle,
    Interaction,
} from "discord.js";
import { addCooldown, addExpiry, getResponse, onCooldown } from "../utils/cooldownhandler.js";
import {
    getXp,
    getPrestigeRequirement,
    getBankBalance,
    getPrestigeRequirementBal,
    updateBankBalance,
    updateXp,
    getPrestige,
    setPrestige,
    userExists,
    createUser,
    getMulti,
    calcMaxBet,
    getInventory,
    setInventory,
} from "../utils/economy/utils.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("prestige", "prestige to gain extra benefits", Categories.MONEY);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    if (!(await userExists(message.member))) await createUser(message.member);

    // if (await getPrestige(message.member) >= 20) {
    //     return message.channel.send({
    //         embeds: [
    //             new ErrorEmbed("gg, you're max prestige. you completed nypsi").setImage("https://i.imgur.com/vB3UGgi.png"),
    //         ],
    //     })
    // }

    let currentXp = await getXp(message.member),
        neededXp = await getPrestigeRequirement(message.member);
    let currentBal = await getBankBalance(message.member),
        neededBal = getPrestigeRequirementBal(neededXp);

    if (currentXp < neededXp) {
        return message.channel.send({ embeds: [new ErrorEmbed(`you need **${neededXp.toLocaleString()}**xp to prestige`)] });
    }

    if (currentBal < neededBal) {
        return message.channel.send({
            embeds: [
                new CustomEmbed(
                    message.member,
                    `you need $**${neededBal.toLocaleString()}** in your **bank** to be able to prestige`
                ).setHeader("prestige", message.author.avatarURL()),
            ],
        });
    }

    const embed = new CustomEmbed(
        message.member,
        "are you sure you want to prestige?\n\n" +
            `you will lose **${neededXp.toLocaleString()}**xp and $**${neededBal.toLocaleString()}**\n\n`
    ).setHeader("prestige", message.author.avatarURL());

    await addCooldown(cmd.name, message.member);

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("✅").setLabel("do it.").setStyle(ButtonStyle.Success)
    );

    const msg = await message.channel.send({ embeds: [embed], components: [row] });

    const filter = (i: Interaction) => i.user.id == message.author.id;

    const reaction = await msg
        .awaitMessageComponent({ filter, time: 15000 })
        .then(async (collected) => {
            await collected.deferUpdate();
            return collected.customId;
        })
        .catch(async () => {
            embed.setDescription("❌ expired");
            await msg.edit({ embeds: [embed], components: [] });
            addExpiry(cmd.name, message.member, 30);
        });

    if (reaction == "✅") {
        await addExpiry(cmd.name, message.member, 1800);
        currentXp = await getXp(message.member);
        neededXp = await getPrestigeRequirement(message.member);
        currentBal = await getBankBalance(message.member);
        neededBal = getPrestigeRequirementBal(neededXp);

        if (currentXp < neededXp) {
            return message.channel.send({
                embeds: [new ErrorEmbed(`you need **${neededXp.toLocaleString()}**xp to prestige`)],
            });
        }

        if (currentBal < neededBal) {
            return message.channel.send({
                embeds: [
                    new CustomEmbed(
                        message.member,
                        `you need $**${neededBal.toLocaleString()}** in your **bank** to be able to prestige`
                    ).setHeader("prestige", message.author.avatarURL()),
                ],
            });
        }

        await updateBankBalance(message.member, currentBal - neededBal);
        await updateXp(message.member, currentXp - neededXp);
        await setPrestige(message.member, (await getPrestige(message.member)) + 1);

        const multi = await getMulti(message.member);
        const maxBet = await calcMaxBet(message.member);

        const inventory = await getInventory(message.member);

        let amount = 1;

        if ((await getPrestige(message.member)) > 5) {
            amount = 2;
        } else if ((await getPrestige(message.member)) > 10) {
            amount = 3;
        }

        if (inventory["basic_crate"]) {
            inventory["basic_crate"] += amount;
        } else {
            inventory["basic_crate"] = amount;
        }

        await setInventory(message.member, inventory);

        let crateAmount = Math.floor((await getPrestige(message.member)) / 2 + 1);

        if (crateAmount > 5) crateAmount = 5;

        embed.setDescription(
            `you are now prestige **${await getPrestige(message.member)}**\n\n` +
                `new vote rewards: $**${(
                    15000 *
                    ((await getPrestige(message.member)) + 1)
                ).toLocaleString()}**, **${crateAmount}** vote crates\n` +
                `your new multiplier: **${Math.floor(multi * 100)}**%\nyour maximum bet: $**${maxBet.toLocaleString()}**\n` +
                `you have also received **${amount}** basic crate${amount > 1 ? "s" : ""}`
        );

        await msg.edit({ embeds: [embed], components: [] });
    }
}

cmd.setRun(run);

module.exports = cmd;
