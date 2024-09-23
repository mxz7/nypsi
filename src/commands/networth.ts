import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { calcNetWorth } from "../utils/functions/economy/balance";
import { getInventory } from "../utils/functions/economy/inventory";
import { createUser, getItems, isEcoBanned, userExists } from "../utils/functions/economy/utils";
import { getMember } from "../utils/functions/member";
import PageManager from "../utils/functions/page";
import { isUserBlacklisted } from "../utils/functions/users/blacklist";
import { hasProfile } from "../utils/functions/users/utils";
import { addView } from "../utils/functions/users/views";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { getFarm } from "../utils/functions/economy/farm";

const cmd = new Command("networth", "view breakdown of your networth", "money").setAliases([
  "net",
  "nw",
]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) message.channel.send({ embeds: [res.embed] });
    return;
  }

  await addCooldown(cmd.name, message.member, 30);

  let target = message.member;

  if (args.length >= 1) {
    target = await getMember(message.guild, args.join(" "));

    if (!target) {
      return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] });
    }
  }

  if (!(await hasProfile(target)))
    return message.channel.send({
      embeds: [new ErrorEmbed(`${target.toString()} has never used nypsi. what a LOSER lol.`)],
    });

  if (!(await userExists(target))) await createUser(target);

  if (await isUserBlacklisted(target.user.id))
    return message.channel.send({
      embeds: [
        new ErrorEmbed(
          `${target.user.toString()} is blacklisted 😬. they did something REALLY bad. laugh at them for me. lol. AHHAHAAHHA`,
        ),
      ],
    });

  if ((await isEcoBanned(target.user.id)).banned)
    return message.channel.send({
      embeds: [new ErrorEmbed(`${target.toString()} is banned AHAHAHAHA`)],
    });

  const [net, inventory] = await Promise.all([
    calcNetWorth("cmd", target, true),
    getInventory(target),
  ]);

  const embed = new CustomEmbed(target).setHeader(
    `${target.user.username}'s networth`,
    target.user.avatarURL(),
  );

  let mainValues = `🌍 $**${net.amount.toLocaleString()}**\n`;
  const itemValues: { itemId: string; value: number }[] = [];

  for (const [key, value] of net.breakdown.entries()) {
    if (value <= 0) continue;

    if (key === "balance") {
      mainValues += `\n💰 $**${value.toLocaleString()}** (${((value / net.amount) * 100).toFixed(
        2,
      )}%)`;
    } else if (key === "guild") {
      mainValues += `\n👥 $**${value.toLocaleString()}** (${((value / net.amount) * 100).toFixed(
        2,
      )}%)`;
    } else if (key === "workers") {
      mainValues += `\n👷🏻‍♂️ $**${value.toLocaleString()}** (${((value / net.amount) * 100).toFixed(
        2,
      )}%)`;
    } else if (key === "bakery") {
      mainValues += `\n${getItems()["furnace"].emoji} $**${value.toLocaleString()}** (${(
        (value / net.amount) *
        100
      ).toFixed(2)}%)`;
    } else if (key === "garage") {
      mainValues += `\n🔧 $**${value.toLocaleString()}** (${((value / net.amount) * 100).toFixed(
        2,
      )}%)`;
    } else if (key === "farm") {
      mainValues += `\n🌱 $**${value.toLocaleString()}** (${((value / net.amount) * 100).toFixed(
        2,
      )}%)`;
    } else {
      itemValues.push({ itemId: key, value });
    }
  }

  inPlaceSort(itemValues).desc((i) => i.value);

  const pages = PageManager.createPages(
    itemValues.map(
      (i) =>
        `\`${inventory.find((inv) => inv.item === i.itemId).amount.toLocaleString()}x\` ${
          getItems()[i.itemId].emoji
        } ${getItems()[i.itemId].name}: $**${i.value.toLocaleString()}** (${(
          (i.value / net.amount) *
          100
        ).toFixed(2)}%)`,
    ),
  );

  embed.setDescription(mainValues);
  if (itemValues && itemValues.length > 1)
    embed.addField(
      `inventory (${itemValues
        .map((i) => (i.value / net.amount) * 100)
        .reduce((a, b) => a + b)
        .toFixed(2)}%)`,
      pages.get(1).join("\n"),
    );

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("⬅")
      .setLabel("back")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
  );
  if (pages.size == 1) return message.channel.send({ embeds: [embed] });
  const msg = await message.channel.send({ embeds: [embed], components: [row] });

  addView(target.user.id, message.author.id, `profile in ${message.guild.id}`);

  const manager = new PageManager({
    embed,
    message: msg,
    row,
    userId: message.author.id,
    pages,
    allowMessageDupe: true,
    updateEmbed(page, embed) {
      embed.data.fields.length = 0;
      embed.addField(
        `inventory (${itemValues
          .map((i) => (i.value / net.amount) * 100)
          .reduce((a, b) => a + b)
          .toFixed(2)}%)`,
        page.join("\n"),
      );

      return embed;
    },
  });

  return manager.listen();
}

cmd.setRun(run);

module.exports = cmd;
