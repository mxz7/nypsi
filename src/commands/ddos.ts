import { CommandInteraction, GuildMember } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { getMember } from "../utils/functions/member";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("ddos", "ddos other users (fake)", "fun").setAliases(["hitoff"]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) message.channel.send({ embeds: [res.embed] });
    return;
  }

  if (args.length == 0) {
    return message.channel.send({ embeds: [new ErrorEmbed("$ddos <user>")] });
  }

  let member: GuildMember;

  if (args.length == 0) {
    member = message.member;
  } else {
    member = await getMember(message.guild, args.join(" "));
  }

  if (!member) {
    return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  const ip = `${randNumber()}.${randNumber()}.${randNumber()}.${randNumber()}`;
  const port = `${randPort()}`;

  await addCooldown(cmd.name, message.member, 5);

  const embed = new CustomEmbed(
    message.member,
    member.user.toString() +
      "\n\n" +
      "**ip** *obtaining..*" +
      "\n" +
      "**port** *waiting...*" +
      "\n\n" +
      "**status** *online*",
  ).setHeader("ddos tool");

  return message.channel.send({ embeds: [embed] }).then((m) => {
    embed.setDescription(
      member.user.toString() +
        "\n\n" +
        `**ip** *${ip}*` +
        "\n" +
        "**port** *scanning..*" +
        "\n\n" +
        "**status** *online*",
    );

    setTimeout(() => {
      m.edit({ embeds: [embed] }).then(() => {
        embed.setDescription(
          member.user.toString() +
            "\n\n" +
            `**ip** *${ip}*` +
            "\n" +
            `**port** *${port}*` +
            "\n\n" +
            "**status** *online*",
        );

        setTimeout(() => {
          m.edit({ embeds: [embed] }).then(() => {
            embed.setDescription(
              member.user.toString() +
                "\n\n" +
                `**ip** *${ip}*` +
                "\n" +
                `**port** *${port}*` +
                "\n\n" +
                "**status** *offline*",
            );
            embed.setColor(Constants.EMBED_SUCCESS_COLOR);

            setTimeout(() => {
              m.edit({ embeds: [embed] });
            }, 1000);
          });
        }, 1000);
      });
    }, 1000);
  });
}

function randNumber() {
  return Math.floor(Math.random() * 254) + 1;
}

function randPort() {
  return Math.floor(Math.random() * 25565);
}

cmd.setRun(run);

module.exports = cmd;
