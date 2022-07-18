import { CommandInteraction, Message, PermissionFlagsBits } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";

const cmd = new Command("purge", "bulk delete/purge messages", Categories.MODERATION)
    .setAliases(["del"])
    .setPermissions(["MANAGE_MESSAGES"]);

cmd.slashEnabled = true;
cmd.slashData.addIntegerOption((option) =>
    option.setName("amount").setDescription("amount of messages to delete").setRequired(true)
);

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return;
    }

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

    if (isNaN(parseInt(args[0])) || parseInt(args[0]) <= 0) {
        return send({ embeds: [new ErrorEmbed("$del <amount> (@user)")] });
    }

    let amount = parseInt(args[0]);

    if (amount < 60) amount++;

    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        if (amount > 100) {
            amount = 100;
        }

        await addCooldown(cmd.name, message.member, 30);
    }

    if (!message.channel.isTextBased()) return;
    if (message.channel.isDMBased()) return;

    if (message instanceof Message && message.mentions.members.first()) {
        await message.delete();
        const target = message.mentions.members.first();

        const collected = await message.channel.messages.fetch({ limit: 100 });

        const collecteda = collected.filter((msg) => {
            if (!msg.author) return;
            return msg.author.id == target.user.id;
        });

        if (collecteda.size == 0) {
            return;
        }

        let count = 0;

        for (const m of collecteda.keys()) {
            const msg = collecteda.get(m);
            if (count >= amount) {
                collecteda.delete(msg.id);
            } else {
                count++;
            }
        }

        return await message.channel.bulkDelete(collecteda);
    }

    if (!(message instanceof Message)) {
        await message.deferReply();
    }

    if (amount <= 100) {
        await message.channel.bulkDelete(amount, true).catch();
    } else {
        amount = amount - 1;

        const amount1 = amount;
        let fail = false;
        let counter = 0;

        if (amount > 10000) {
            amount = 10000;
        }

        const embed = new CustomEmbed(
            message.member,
            "deleting `" + amount + "` messages..\n - if you'd like to cancel this operation, delete this message"
        ).setHeader("purge");

        const m = await message.channel.send({ embeds: [embed] });
        for (let i = 0; i < amount1 / 100; i++) {
            if (amount < 10) return await m.delete().catch();

            if (amount <= 100) {
                let messages = await message.channel.messages.fetch({ limit: amount, before: m.id });

                messages = messages.filter((m) => {
                    return timeSince(new Date(m.createdTimestamp)) < 14;
                });

                await message.channel.bulkDelete(messages).catch();
                return await m.delete().catch();
            }

            let messages = await message.channel.messages.fetch({ limit: 100, before: m.id });

            messages = messages.filter((m) => {
                return timeSince(new Date(m.createdTimestamp)) < 14;
            });

            if (messages.size < 100) {
                amount = messages.size;
                counter = 0;
                embed.setDescription(
                    "deleting `" +
                        amount +
                        " / " +
                        amount1 +
                        "` messages..\n - if you'd like to cancel this operation, delete this message"
                );
                let stop = false;
                await m.edit({ embeds: [embed] }).catch(() => {
                    stop = true;
                    embed.setDescription("✅ operation cancelled");
                    return message.channel.send({ embeds: [embed] });
                });
                if (stop) return;
            }

            await message.channel.bulkDelete(messages).catch(() => {
                fail = true;
            });

            if (fail) {
                return;
            }

            amount = amount - 100;
            counter++;

            if (counter >= 2) {
                counter = 0;
                embed.setDescription(
                    "deleting `" +
                        amount +
                        " / " +
                        amount1 +
                        "` messages..\n - if you'd like to cancel this operation, delete this message"
                );
                let stop = false;
                await m.edit({ embeds: [embed] }).catch(() => {
                    stop = true;
                    embed.setDescription("✅ operation cancelled");
                    return message.channel.send({ embeds: [embed] });
                });
                if (stop) return;
            }
        }
        if (!(message instanceof Message)) {
            message.editReply({ embeds: [new CustomEmbed(message.member, "operation complete (:")] }).catch(() => {});
        }
        return m.delete().catch();
    }
}

cmd.setRun(run);

module.exports = cmd;

function timeSince(date) {
    const ms = Math.floor(new Date().getTime() - date);

    const days = Math.floor(ms / (24 * 60 * 60 * 1000));

    return days;
}
