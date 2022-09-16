import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { getInventory, setInventory } from "../utils/functions/economy/inventory";
import { createUser, userExists } from "../utils/functions/economy/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

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
