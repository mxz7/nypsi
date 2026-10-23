import { CommandInteraction } from "discord.js";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { syncSlashCommands } from "../utils/functions/slash-commands";
import { hasAdminPermission } from "../utils/functions/users/admin";
import { getCommandData, getCommandKeys } from "../utils/handlers/commandhandler";
import { logger } from "../utils/logger";
import { getRest } from "../utils/rest";

const cmd = new Command("reloadslash", "reload data for slash commands", "none").setPermissions([
  "bot owner",
]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (!(await hasAdminPermission(message.member, "reload"))) return;

  const global = args[0]?.toLowerCase() === "global";

  if (args.length > 1 || (args.length === 1 && !global && args[0].toLowerCase() !== "guild")) {
    return send({ embeds: [new ErrorEmbed("reloadslash [global|guild]")] });
  }

  const scope = global ? "global" : `guild ${message.guild.id}`;
  const applicationId = message.client.user.id;
  const guildId = global ? undefined : message.guild.id;

  try {
    const slashData = Array.from(getCommandKeys())
      .map((name) => getCommandData(name))
      .filter((command) => command.slashEnabled)
      .map((command) => command.slashData.toJSON());

    logger.info(`slash commands: comparing ${scope} definitions`, { applicationId, guildId });

    const changes = await syncSlashCommands(
      getRest(message.client as NypsiClient),
      applicationId,
      slashData,
      guildId,
    );

    logger.info(
      `slash commands: synced ${scope}: ${changes.added.length} added, ${changes.updated.length} updated, ${changes.removed.length} removed, ${changes.unchanged} unchanged`,
      { applicationId, guildId, ...changes },
    );

    const changed = changes.added.length + changes.updated.length + changes.removed.length;
    const lines = [
      changed ? `${scope}: slash commands synced` : `${scope}: slash commands already up to date`,
      `${changes.added.length} added · ${changes.updated.length} updated · ${changes.removed.length} removed · ${changes.unchanged} unchanged`,
    ];

    for (const [label, names] of [
      ["added", changes.added],
      ["updated", changes.updated],
      ["removed", changes.removed],
    ] as const) {
      if (names.length)
        lines.push(`**${label}**: ${names.map((name) => `\`/${name}\``).join(", ")}`);
    }

    return send({ embeds: [new CustomEmbed(message.member, lines.join("\n\n"))] });
  } catch (error) {
    logger.error(`slash commands: failed to sync ${scope}`, { applicationId, guildId, error });

    return send({
      embeds: [
        new ErrorEmbed(
          `${scope}: failed to sync slash commands. check the logs; some changes may have been applied. rerun reloadslash to retry`,
        ),
      ],
    });
  }
}

cmd.setRun(run);

module.exports = cmd;
