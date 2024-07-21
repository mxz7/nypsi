import { Interaction } from "discord.js";
import { readdir } from "fs/promises";
import redis from "../../init/redis";
import { CustomEmbed, ErrorEmbed } from "../../models/EmbedBuilders";
import { AutocompleteHandler, InteractionHandler } from "../../types/InteractionHandler";
import Constants from "../Constants";
import { getReactionRolesByGuild } from "../functions/guilds/reactionroles";
import { createProfile, hasProfile } from "../functions/users/utils";
import { logger } from "../logger";

const autocompleteHandlers = new Map<string, AutocompleteHandler>();
const interactionHandlers = new Map<string, InteractionHandler>();

export async function loadInteractions() {
  const files = await readdir("./dist/interactions").then((r) =>
    r.filter((i) => i.endsWith(".js")),
  );

  for (const fileName of files) {
    const res: InteractionHandler | AutocompleteHandler = await import(
      `../../interactions/${fileName}`
    ).then((r) => r.default);

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
  const files = await readdir("./dist/interactions").then((r) =>
    r.filter((i) => i.endsWith(".js")),
  );

  for (const fileName of files) {
    delete require.cache[require.resolve(`../../interactions/${fileName}`)];
  }
  return loadInteractions();
}

export async function runInteraction(interaction: Interaction) {
  if (interaction.isAutocomplete()) {
    return autocompleteHandlers.get(interaction.options.getFocused(true).name)?.run(interaction);
  } else if (interaction.isMessageComponent() && !interactionHandlers.has(interaction.customId)) {
    if (!(await hasProfile(interaction.user.id))) await createProfile(interaction.user);

    if (
      (await redis.exists(`${Constants.redis.nypsi.PROFILE_TRANSFER}:${interaction.user.id}`)) &&
      (interaction.isButton() ? interaction.customId !== "t-f-p-boobies" : true)
    ) {
      if (interaction.isRepliable()) {
        interaction.reply({
          embeds: [
            new ErrorEmbed(
              "your profile is currently involved in a profile transfer and you cannot use commands. this will expire in 10 minutes",
            ),
          ],
        });
      }
      return;
    }
    if (!interaction.guild) return;
    const reactionRoles = await getReactionRolesByGuild(interaction.guild);

    if (reactionRoles.length === 0) return;

    const interactionMessageId = interaction.message.id;
    const customId = interaction.customId;

    const reactionRole = reactionRoles.find((r) => r.messageId === interactionMessageId);
    if (!reactionRole) return;

    setTimeout(() => {
      interaction.deferReply({ ephemeral: true }).catch(() => {});
    }, 1000);

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

          return interaction
            .reply({
              embeds: [
                new ErrorEmbed(`you require ${role || reactionRole.whitelist[0]} to use this`),
              ],
              ephemeral: true,
            })
            .catch(() =>
              interaction.editReply({
                embeds: [
                  new ErrorEmbed(`you require ${role || reactionRole.whitelist[0]} to use this`),
                ],
              }),
            );
        } else {
          const roles: string[] = [];

          for (const roleId of reactionRole.whitelist) {
            const role = await interaction.guild.roles
              .fetch(roleId)
              .then((r) => r.toString())
              .catch(() => {});

            roles.push(role || roleId);
          }

          return interaction
            .reply({
              embeds: [new ErrorEmbed(`to use this, you need one of:\n\n${roles.join("\n")}`)],
              ephemeral: true,
            })
            .catch(() =>
              interaction.editReply({
                embeds: [new ErrorEmbed(`to use this, you need one of:\n\n${roles.join("\n")}`)],
              }),
            );
        }
      }
    }

    const roleId = reactionRole.roles.find((r) => r.roleId === customId).roleId;
    if (!roleId) {
      return interaction
        .reply({
          embeds: [new ErrorEmbed(`couldn't find role with id \`${customId}\``)],
          ephemeral: true,
        })
        .catch(() =>
          interaction.editReply({
            embeds: [new ErrorEmbed(`couldn't find role with id \`${customId}\``)],
          }),
        );
    }

    const responseDesc: string[] = [];

    if (member.roles.cache.has(roleId)) {
      const role = member.roles.cache.find((r) => r.id === roleId);
      let fail = false;
      await member.roles.remove(roleId).catch(() => {
        fail = true;
        interaction
          .reply({
            embeds: [
              new ErrorEmbed(`failed to remove ${role.toString()}, i may not have permissions`),
            ],
            ephemeral: true,
          })
          .catch(() =>
            interaction.editReply({
              embeds: [
                new ErrorEmbed(`failed to remove ${role.toString()}, i may not have permissions`),
              ],
            }),
          );
      });
      if (fail) return;
      responseDesc.push(`\\- ${role.toString()}`);
    } else {
      if (reactionRole.mode === "UNIQUE") {
        for (const role of member.roles.cache.values()) {
          if (reactionRole.roles.find((r) => r.roleId === role.id)) {
            let fail = false;
            await member.roles.remove(role).catch(() => (fail = true));
            if (!fail) responseDesc.push(`\\- ${role.toString()}`);
          }
        }
      }

      const role = await interaction.guild.roles.cache.get(roleId);

      if (!role) {
        return interaction
          .reply({ embeds: [new ErrorEmbed("role is not valid")], ephemeral: true })
          .catch(() => interaction.editReply({ embeds: [new ErrorEmbed("role is not valid")] }));
      }

      let fail = false;

      await member.roles.add(role).catch(() => {
        interaction
          .reply({
            embeds: [
              new ErrorEmbed(`failed to add ${role.toString()}, i may not have permissions`),
            ],
            ephemeral: true,
          })
          .catch(() =>
            interaction.editReply({
              embeds: [
                new ErrorEmbed(`failed to add ${role.toString()}, i may not have permissions`),
              ],
            }),
          );
        fail = true;
      });

      if (fail) return;

      responseDesc.push(`+ ${role.toString()}`);
      logger.info(`(reaction roles) added ${role.id} to ${member.user.id}`);
    }

    if (responseDesc.length > 0) {
      return interaction
        .reply({ embeds: [new CustomEmbed(member, responseDesc.join("\n"))], ephemeral: true })
        .catch(() =>
          interaction.editReply({ embeds: [new CustomEmbed(member, responseDesc.join("\n"))] }),
        );
    }
  } else if (interaction.isMessageComponent()) {
    if (
      (await redis.exists(`${Constants.redis.nypsi.PROFILE_TRANSFER}:${interaction.user.id}`)) &&
      (interaction.isButton() ? interaction.customId !== "t-f-p-boobies" : true)
    ) {
      if (interaction.isRepliable()) {
        interaction.reply({
          embeds: [
            new ErrorEmbed(
              "your profile is currently involved in a profile transfer and you cannot use commands. this will expire in 10 minutes",
            ),
          ],
        });
      }
      return;
    }
    return interactionHandlers.get(interaction.customId)?.run(interaction);
  }
}
