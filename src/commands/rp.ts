import {
  ActionRowBuilder,
  CommandInteraction,
  Interaction,
  MessageActionRowComponentBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { getMember } from "../utils/functions/member";
import {
  addRoleplayStat,
  getRoleplayActionTotals,
  getRoleplayStatsByAction,
  getRoleplayTargetTotals,
} from "../utils/functions/roleplay";
import { pluralize } from "../utils/functions/string";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

type RoleplayAction = {
  gifs: string[];
  senderText: string; // e.g. "**{sender}** kissed **{target}**"
  selfText: string; // used when no target given
};

const actions: Record<string, RoleplayAction> = {
  kiss: {
    gifs: [
      "https://c.tenor.com/N57Xg6F8-vYAAAAd/tenor.gif",
      "https://c.tenor.com/W-R9sPkk_IMAAAAd/tenor.gif",
    ],
    senderText: "**{sender}** kissed **{target}** 💋",
    selfText: "**{sender}** kissed themselves... that's a bit lonely 💋",
  },
  hug: {
    gifs: [
      "https://c.tenor.com/ac3otYT77RcAAAAd/tenor.gif",
      "https://c.tenor.com/2s-NG_10o4MAAAAd/tenor.gif",
    ],
    senderText: "**{sender}** hugged **{target}** 🤗",
    selfText: "**{sender}** hugged themselves 🤗",
  },
};

const cmd = new Command("rp", "roleplay actions", "fun").setAliases(["roleplay"]);

// build shorthands from actions: kiss -> rp kiss, hug -> rp hug
cmd.setShorthands(
  Object.fromEntries(Object.keys(actions).map((action) => [action, `rp ${action}`])),
);

cmd.slashEnabled = true;

for (const [action] of Object.entries(actions)) {
  cmd.slashData.addSubcommand((sub) =>
    sub
      .setName(action)
      .setDescription(`${action} someone`)
      .addUserOption((opt) =>
        opt.setName("target").setDescription(`the person to ${action}`).setRequired(false),
      ),
  );
}

cmd.slashData.addSubcommand((sub) =>
  sub.setName("stats").setDescription("view your roleplay stats"),
);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);
    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const action = args[0]?.toLowerCase();

  if (action === "stats") {
    const [actionTotals, targetTotals] = await Promise.all([
      getRoleplayActionTotals(message.author.id),
      getRoleplayTargetTotals(message.author.id),
    ]);

    if (actionTotals.length === 0) {
      return send({
        embeds: [
          new CustomEmbed(message.member)
            .setHeader("roleplay stats", message.author.avatarURL())
            .setDescription("you haven't done any roleplay actions yet"),
        ],
      });
    }

    const buildEmbed = () => {
      const embed = new CustomEmbed(message.member).setHeader(
        "roleplay stats",
        message.author.avatarURL(),
      );

      embed.addField(
        "most used actions",
        actionTotals.map((r) => `\`${r.action}\` — ${pluralize("time", r.count)}`).join("\n"),
        true,
      );

      embed.addField(
        "most actioned users",
        targetTotals.map((t) => `**${t.username}** — ${pluralize("time", t.count)}`).join("\n"),
        true,
      );

      return embed;
    };

    const buildActionEmbed = async (selectedAction: string) => {
      const topUsers = await getRoleplayStatsByAction(message.author.id, selectedAction);
      const embed = new CustomEmbed(message.member).setHeader(
        "roleplay stats",
        message.author.avatarURL(),
      );

      embed.addField(
        `top users you've ${selectedAction}ed`,
        topUsers
          .map(
            (r, i) => `${i + 1}. **${r.target.lastKnownUsername}** — ${pluralize("time", r.count)}`,
          )
          .join("\n") || "none",
      );

      return embed;
    };

    const actionNames = actionTotals.map((r) => r.action);

    const buildSelectRow = (current: string | null) =>
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("rp-stats-action")
          .setPlaceholder("view top users per action")
          .setOptions([
            new StringSelectMenuOptionBuilder()
              .setLabel("overview")
              .setValue("__overview__")
              .setDefault(current === null),
            ...actionNames.map((a) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(a)
                .setValue(a)
                .setDefault(a === current),
            ),
          ]),
      );

    const overviewEmbed = buildEmbed();

    let msg = await send({
      embeds: [overviewEmbed],
      components: [buildSelectRow(null)],
    });

    const filter = (i: Interaction) => i.user.id === message.author.id;

    const pageManager: () => Promise<void> = async () => {
      const i = await msg.awaitMessageComponent({ filter, time: 60_000 }).catch(() => null as null);

      if (!i) {
        msg.edit({ components: [] }).catch(() => {});
        return;
      }

      setTimeout(() => {
        if (!i.deferred && !i.replied) i.deferUpdate().catch(() => {});
      }, 2000);

      if (i.isStringSelectMenu()) {
        const selectedAction = i.values[0];

        if (selectedAction === "__overview__") {
          await i
            .update({ embeds: [overviewEmbed], components: [buildSelectRow(null)] })
            .catch(() => msg.edit({ embeds: [overviewEmbed], components: [buildSelectRow(null)] }));
        } else {
          const actionEmbed = await buildActionEmbed(selectedAction);
          const selectRow = buildSelectRow(selectedAction);

          await i
            .update({ embeds: [actionEmbed], components: [selectRow] })
            .catch(() => msg.edit({ embeds: [actionEmbed], components: [selectRow] }));
        }
      }

      return pageManager();
    };

    pageManager();
    return;
  }

  if (!action || !actions[action]) {
    const list = Object.keys(actions).join(", ");
    return send({
      embeds: [
        new CustomEmbed(message.member)
          .setHeader("roleplay")
          .setDescription(
            `available actions: ${list}\n\nusage: \`/rp <action> [user]\`\n\`/rp stats\` - view your roleplay stats`,
          ),
      ],
    });
  }

  const actionData = actions[action];

  await addCooldown(cmd.name, message.member, 3);

  let target = message.mentions?.members?.first();

  if (!target && args[1]) {
    target = await getMember(message.guild, args.slice(1).join(" "));
    if (!target) {
      return send({ embeds: [new ErrorEmbed("couldn't find that user")] });
    }
  }

  if (!target) {
    return send({ embeds: [new ErrorEmbed(`you need to specify someone to ${action}`)] });
  }

  const senderName = message.author.username;
  const targetName = target.user.username;

  const text =
    target.user.id !== message.author.id
      ? actionData.senderText.replace("{sender}", senderName).replace("{target}", targetName)
      : actionData.selfText.replace("{sender}", senderName);

  const gif = actionData.gifs[Math.floor(Math.random() * actionData.gifs.length)];

  const count =
    target.user.id !== message.author.id
      ? await addRoleplayStat(message.author.id, target.user.id, action)
      : null;

  const embed = new CustomEmbed(message.member)
    .setHeader(text, message.author.avatarURL())
    .setImage(gif);

  if (count !== null) {
    embed.setFooter({ text: `${action}ed ${targetName} ${pluralize("time", count)}` });
  }

  return send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
