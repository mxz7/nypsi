import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ColorResolvable,
  CommandInteraction,
  ComponentType,
  EmbedBuilder,
  GuildMember,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { imageExists, uploadImage } from "../utils/functions/image";
import { getMember } from "../utils/functions/member";
import sharp = require("sharp");

const cmd = new Command("color", "get a random hex color code", "info").setAliases(["colour"]);

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  let color: string;
  let member: GuildMember;

  if (args.length == 0) {
    color = Math.floor(Math.random() * 16777215).toString(16);
    while (color.length != 6) {
      color = Math.floor(Math.random() * 16777215).toString(16);
    }
  }

  if (args.length != 0) {
    if (args[0].match(Constants.COLOUR_REGEX)) color = args[0].substring(1);
    else {
      member = await getMember(message.guild, args.join(" "));

      if (!member) {
        color = args[0].split("#").join("");
        if (color.length > 6) {
          color = color.substring(0, 6);
        }
      } else {
        color = member.displayHexColor.substring(1);
      }
    }
  }

  const embed = new CustomEmbed(message.member).setHeader(`#${color}`);

  try {
    embed.setColor(color as ColorResolvable);
  } catch {
    return message.channel.send({ embeds: [new ErrorEmbed("invalid color")] });
  }

  if (member) {
    embed.setDescription(member.user.toString());
    embed.setHeader(member.displayHexColor);
  }

  const id = `colour/${color}/54x42`;
  const promises: Promise<void>[] = [];

  if (await imageExists(id)) {
    embed.setImage(`https://cdn.nypsi.xyz/${id}`);
  } else {
    embed.setImage(`https://singlecolorimage.com/get/${color}/54x42`);

    promises.push(
      (async () => {
        const res = await fetch(`https://singlecolorimage.com/get/${color}/54x42`);

        if (res.ok && res.status === 200) {
          const arrayBuffer = await res.arrayBuffer();
          await uploadImage(id, Buffer.from(arrayBuffer), "image/png");
        }
      })(),
    );
  }

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Secondary).setCustomId("circle").setLabel("circle"),
  );

  const msg = await message.channel
    .send({ embeds: [embed], components: [row] })
    .catch(async () => message.channel.send({ embeds: [new ErrorEmbed("invalid color")] }));

  const listen = async () => {
    const interaction = await msg
      .awaitMessageComponent({
        filter: (i) => i.user.id === message.author.id,
        componentType: ComponentType.Button,
        time: 15000,
      })
      .catch(async () => msg.edit({ components: [] }));

    if (!interaction || interaction instanceof Message) return;

    setTimeout(() => {
      if (msg.components.length > 0) msg.edit({ components: [] });
      interaction.deferReply().catch(() => {});
    }, 1000);

    const circleId = `colour/${color}/128x128-circle`;

    if (!(await imageExists(circleId))) {
      await Promise.all(promises);
      const res = await fetch(`https://cdn.nypsi.xyz/${id}`);

      if (!res.ok || res.status !== 200) {
        msg.edit({ components: [] });
        return interaction
          .reply({ embeds: [new ErrorEmbed("failed to generate circle")] })
          .catch(() =>
            interaction.editReply({ embeds: [new ErrorEmbed("failed to generate circle")] }),
          );
      }

      const arrayBuffer = await res.arrayBuffer();

      const roundedEdges = Buffer.from(
        '<svg><rect x="0" y="0" width="128" height="128" rx="128" ry="128"/></svg>',
      );

      const circleImage = await sharp(arrayBuffer)
        .resize(128, 128, { fit: "fill" })
        .composite([{ input: roundedEdges, blend: "dest-in" }])
        .png()
        .toBuffer();

      await uploadImage(circleId, circleImage, "image/png");
    }

    msg.edit({ components: [] });
    interaction
      .reply({
        embeds: [
          new EmbedBuilder()
            .setColor(color as ColorResolvable)
            .setImage(`https://cdn.nypsi.xyz/${circleId}`),
        ],
      })
      .catch(() =>
        interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(color as ColorResolvable)
              .setImage(`https://cdn.nypsi.xyz/${circleId}`),
          ],
        }),
      );
  };

  listen();
}

cmd.setRun(run);

module.exports = cmd;
