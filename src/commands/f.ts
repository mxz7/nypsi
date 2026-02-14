import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  MessageActionRowComponentBuilder,
  MessageFlags,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { pluralize } from "../utils/functions/string";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("f", "pay your respects", "fun");

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

  if (args.length == 0) {
    return send({
      embeds: [new ErrorEmbed("you need to pay respects to something")],
    });
  }

  await addCooldown(cmd.name, message.member, 15);

  let content = args.join(" ");

  if (content.split("\n").length > 2) {
    content = content.split("\n").join(".");
  }

  if (content.length > 50) {
    content = content.substring(0, 50);
  }

  const embed = new CustomEmbed(
    message.member,
    `press **F** to pay your respects to **${content}**`,
  );

  const customId = `${content}-${new Date().getTime()}`;
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Primary).setLabel("F").setCustomId(customId),
  );

  await send({ embeds: [embed], components: [row] });

  const reactions: string[] = [];

  const collector = message.channel.createMessageComponentCollector({ time: 60000 });

  collector.on("collect", async (i): Promise<any> => {
    if (i.customId == customId) {
      if (reactions.includes(i.user.id)) {
        return await i
          .reply({
            embeds: [new ErrorEmbed("you can only do this once")],
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
      }

      reactions.push(i.user.id);

      return await i.reply({
        embeds: [
          new CustomEmbed(
            message.member,
            `${i.user.toString()} has paid respects to **${args.join(" ")}**`,
          ),
        ],
      });
    }
  });

  collector.on("end", async () => {
    await message.channel.send({
      embeds: [
        new CustomEmbed(
          message.member,
          `**${reactions.length.toLocaleString()}** ${pluralize("person", reactions.length, "people")} paid their respects to **${content}**`,
        ),
      ],
    });
  });
}

cmd.setRun(run);

module.exports = cmd;
