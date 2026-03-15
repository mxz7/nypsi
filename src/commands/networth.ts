import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  MessageActionRowComponentBuilder,
  MessageFlags,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
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

const cmd = new Command("networth", "view breakdown of your networth", "money").setAliases([
  "net",
  "nw",
]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed] });
    return;
  }

  await addCooldown(cmd.name, message.member, 7);

  let target = message.member;

  if (args.length >= 1) {
    target = await getMember(message.guild, args.join(" "));

    if (!target) {
      return send({ embeds: [new ErrorEmbed("invalid user")] });
    }
  }

  if (!(await hasProfile(target)))
    return send({
      embeds: [new ErrorEmbed(`${target.toString()} has never used nypsi. what a LOSER lol.`)],
    });

  if (!(await userExists(target))) await createUser(target);

  if ((await isUserBlacklisted(target)).blacklisted)
    return send({
      embeds: [
        new ErrorEmbed(
          `${target.user.toString()} is blacklisted 😬. they did something REALLY bad. laugh at them for me. lol. AHHAHAAHHA`,
        ),
      ],
    });

  if ((await isEcoBanned(target)).banned)
    return send({
      embeds: [new ErrorEmbed(`${target.toString()} is banned AHAHAHAHA`)],
    });

  const [net, inventory] = await Promise.all([
    calcNetWorth("cmd", target, target.client as NypsiClient, true),
    getInventory(target),
  ]);

  const embed = new CustomEmbed(target).setHeader(
    `${target.user.username}'s networth`,
    target.user.avatarURL(),
  );

  let mainValues = `🌍 $**${net.amount.toLocaleString()}**\n`;
  const itemValues: { itemId: string; value: number }[] = [];

  const netLines: Record<string, { symbol: string; desc: string }> = {
    balance: { symbol: "💰", desc: "balance, bank, offers, and market offers" },
    guild: { symbol: "👥", desc: "guild worth" },
    workers: { symbol: "👷🏻‍♂️", desc: "worker cost, upgrades, and stored items" },
    bakery: { symbol: getItems()["furnace"].emoji, desc: "bakery upgrades" },
    garage: { symbol: "🔧", desc: "cars and car upgrades" },
    farm: { symbol: "🌱", desc: "seeds, upgrades, and harvest value" },
  };

  for (const [key, value] of net.breakdown.entries()) {
    if (value <= 0) continue;

    if (netLines[key]) {
      mainValues += `\n${netLines[key].symbol} $**${value.toLocaleString()}** (${((value / net.amount) * 100).toFixed(2)}%)`;
    } else {
      itemValues.push({ itemId: key, value });
    }
  }

  inPlaceSort(itemValues).desc((i) => i.value);
  let pages: Map<number, string[]> = new Map();

  if (itemValues.length > 0) {
    pages = PageManager.createPages(
      itemValues.map(
        (i) =>
          `\`${inventory.count(i.itemId).toLocaleString()}x\` ${
            getItems()[i.itemId].emoji
          } ${getItems()[i.itemId].name}: $**${i.value.toLocaleString()}** (${(
            (i.value / net.amount) *
            100
          ).toFixed(2)}%)`,
      ),
    );
  }

  embed.setDescription(mainValues);
  if (itemValues && itemValues.length > 0)
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
    new ButtonBuilder()
      .setCustomId("breakdown")
      .setLabel("breakdown info")
      .setStyle(ButtonStyle.Secondary),
  );
  if (pages.size <= 1) return send({ embeds: [embed] });
  const msg = await send({ embeds: [embed], components: [row] });

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
    handleResponses: new Map().set(
      "breakdown",
      async (manager: PageManager<string>, interaction: ButtonInteraction) => {
        await interaction.reply({
          embeds: [
            new CustomEmbed(message.member)
              .setHeader("networth breakdown information")
              .setDescription(
                Object.values(netLines)
                  .map((i) => `${i.symbol} ${i.desc}`)
                  .join("\n\n"),
              ),
          ],
          flags: MessageFlags.Ephemeral,
        });
        return manager.listen();
      },
    ),
  });

  return manager.listen();
}

cmd.setRun(run);

module.exports = cmd;
