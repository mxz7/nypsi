import { Interaction } from "discord.js";
import { readdir } from "fs/promises";
import { CustomEmbed, ErrorEmbed } from "../../models/EmbedBuilders";
import { AutocompleteHandler, InteractionHandler } from "../../types/InteractionHandler";
import { getReactionRolesByGuild } from "../functions/guilds/reactionroles";
import { logger } from "../logger";

const autocompleteHandlers = new Map<string, AutocompleteHandler>();
const interactionHandlers = new Map<string, InteractionHandler>();

export async function loadInteractions() {
  const files = await readdir("./dist/interactions").then((r) => r.filter((i) => i.endsWith(".js")));

  for (const fileName of files) {
    const res: InteractionHandler | AutocompleteHandler = await import(`../../interactions/${fileName}`).then(
      (r) => r.default
    );

    if (res.type === "autocomplete") {
      autocompleteHandlers.set(res.name, res);
    } else {
      interactionHandlers.set(res.name, res);
    }
  }

  logger.info(`${autocompleteHandlers.size + interactionHandlers.size} interactions loaded`);
}

export async function reloadInteractions() {
  autocompleteHandlers.clear();
  interactionHandlers.clear();
  const files = await readdir("./dist/interactions").then((r) => r.filter((i) => i.endsWith(".js")));

  for (const fileName of files) {
    delete require.cache[require.resolve(`../../interactions/${fileName}`)];
  }
  return loadInteractions();
}

export async function runInteraction(interaction: Interaction) {
  if (interaction.isAutocomplete()) {
    return autocompleteHandlers.get(interaction.options.getFocused(true).name)?.run(interaction);
  } else if (interaction.isMessageComponent() && !interactionHandlers.has(interaction.customId)) {
    if (!interaction.guild) return;
    const reactionRoles = await getReactionRolesByGuild(interaction.guild);

    if (reactionRoles.length === 0) return;

    const interactionMessageId = interaction.message.id;
    const customId = interaction.customId;

    const reactionRole = reactionRoles.find((r) => r.messageId === interactionMessageId);
    if (!reactionRole) return;

    const member = await interaction.guild.members.fetch(interaction.user.id);

    if (reactionRole.whitelist.length !== 0) {
      let allowed = false;
      for (const roleId of reactionRole.whitelist) {
        if (member.roles.cache.has(roleId)) allowed = true;
      }

      if (!allowed) {
        if (reactionRole.whitelist.length === 1) {
          const role = await interaction.guild.roles
            .fetch(reactionRole.whitelist[0])
            .then((r) => r.toString())
            .catch(() => {});
          return interaction.reply({
            embeds: [new ErrorEmbed(`you require ${role || reactionRole.whitelist[0]} to use this`)],
            ephemeral: true,
          });
        } else {
          const roles: string[] = [];

          for (const roleId of reactionRole.whitelist) {
            const role = await interaction.guild.roles
              .fetch(roleId)
              .then((r) => r.toString())
              .catch(() => {});

            roles.push(role || roleId);
          }

          return interaction.reply({
            embeds: [new ErrorEmbed(`to use this, you need one of:\n\n${roles.join("\n")}`)],
            ephemeral: true,
          });
        }
      }
    }

    const roleId = reactionRole.roles.find((r) => r.roleId === customId).roleId;
    if (!roleId) return;

    await interaction.deferReply({ ephemeral: true });

    const responseDesc: string[] = [];

    if (member.roles.cache.has(roleId)) {
      responseDesc.push(`\\- ${member.roles.cache.find((r) => r.id === roleId).toString()}`);
      await member.roles.remove(roleId);
    } else {
      if (reactionRole.mode === "UNIQUE") {
        for (const role of member.roles.cache.values()) {
          if (reactionRole.roles.find((r) => r.roleId === role.id)) {
            responseDesc.push(`- ${role.toString()}`);
            await member.roles.remove(role);
          }
        }
      }

      const role = await interaction.guild.roles.fetch(roleId);

      if (!role) return interaction.editReply({ embeds: [new ErrorEmbed("role is not valid")] });

      await member.roles.add(role);
      responseDesc.push(`+ ${role.toString()}`);
      logger.info(`(reaction roles) added ${role.id} to ${member.user.id}`);
    }

    return interaction.editReply({ embeds: [new CustomEmbed(member, responseDesc.join("\n"))] });
  } else if (interaction.isMessageComponent()) {
    return interactionHandlers.get(interaction.customId)?.run(interaction);
  }
}
