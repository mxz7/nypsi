import { CommandInteraction, Message, ActionRowBuilder, ButtonBuilder } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";

const cmd = new Command("f", "pay your respects", Categories.FUN);

/**
 *
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    if (args.length == 0) {
        return message.channel.send({ embeds: [new ErrorEmbed("you need to pay respects to something")] });
    }

    await addCooldown(cmd.name, message.member, 30);

    let content = args.join(" ");

    if (content.split("\n").length > 2) {
        content = content.split("\n").join(".");
    }

    if (content.length > 50) {
        content = content.substr(0, 50);
    }

    const embed = new CustomEmbed(message.member, `press **F** to pay your respects to **${content}**`);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Primary).setLabel("F").setCustomId("boobies")
    );

    await message.channel.send({ embeds: [embed], components: [row] });

    const reactions = [];

    const collector = message.channel.createMessageComponentCollector({ time: 60000 });

    collector.on("collect", async (i): Promise<any> => {
        if (reactions.includes(i.user.id) || i.deferred) {
            const reply = await i.fetchReply().catch(() => {});

            if (!reply) {
                return await i
                    .reply({ embeds: [new ErrorEmbed("you can only do this once")], ephemeral: true })
                    .catch(() => {});
            }
        }

        await i.deferUpdate().catch(() => {});

        reactions.push(i.user.id);

        return await message.channel.send({
            embeds: [new CustomEmbed(message.member, `${i.user.toString()} has paid respects to **${args.join(" ")}**`)],
        });
    });

    collector.on("end", async () => {
        await message.channel.send({
            embeds: [
                new CustomEmbed(
                    message.member,
                    `**${reactions.length.toLocaleString()}** ${
                        reactions.length != 1 ? "people" : "person"
                    } paid their respects to **${content}**`
                ),
            ],
        });
    });
}

cmd.setRun(run);

module.exports = cmd;
