import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  MessageActionRowComponentBuilder,
  MessageFlags,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { getBoosters, getBoostersDisplay } from "../utils/functions/economy/boosters";
import PageManager from "../utils/functions/page";
import { getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("boosters", "view your current active boosters", "money").setAliases([
  "booster",
]);

cmd.slashEnabled = true;

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const embed = new CustomEmbed(message.member);

  embed.setHeader("your boosters", message.author.avatarURL());

  const pages = await getBoostersDisplay(await getBoosters(message.member), embed);

  if (!pages) {
    embed.setDescription("you have no active boosters");
    return send({ embeds: [embed] });
  }

  if (pages.size <= 1) return send({ embeds: [embed] });

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("⬅")
      .setLabel("back")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
  );

  const msg = await send({ embeds: [embed], components: [row] });

  const manager = new PageManager({
    embed,
    message: msg,
    row,
    userId: message.author.id,
    pages,
    onPageUpdate(manager) {
      manager.embed.setFooter({ text: `page ${manager.currentPage}/${manager.lastPage}` });
      return manager.embed;
    },
  });

  return manager.listen();
}

cmd.setRun(run);

module.exports = cmd;
