import {
    CommandInteraction,
    Message,
    ActionRowBuilder,
    ButtonBuilder,
    MessageActionRowComponentBuilder,
    ButtonStyle,
    Interaction,
} from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders";
import { userExists, createUser, getInventory, setInventory } from "../utils/economy/utils";

const cmd = new Command("clearinventory", "clear your inventory. this cannot be undone", Categories.MONEY).setAliases([
    "clearinv",
]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (!(await userExists(message.member))) await createUser(message.member);

    const inventory = await getInventory(message.member);

    let amount = 0;

    for (const item of Array.from(Object.keys(inventory))) {
        amount += inventory[item];
    }

    if (amount == 0) {
        return message.channel.send({ embeds: [new ErrorEmbed("you dont have anything in your inventory")] });
    }

    const embed = new CustomEmbed(message.member);

    embed.setDescription(`are you sure you want to clear your inventory of **${amount}** items?\n\nthis cannot be undone.`);

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("❌").setLabel("clear").setStyle(ButtonStyle.Danger)
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
            await msg.edit({ components: [] });
        });

    if (reaction == "❌") {
        await setInventory(message.member, {});

        embed.setDescription("✅ your inventory has been cleared");

        await msg.edit({ embeds: [embed], components: [] });
    }
}

cmd.setRun(run);

module.exports = cmd;
