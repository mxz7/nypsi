import {
  ActionRowBuilder,
  CommandInteraction,
  GuildMember,
  Interaction,
  MessageActionRowComponentBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import redis from "../init/redis";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { MStoTime } from "../utils/functions/date";
import { addTaskProgress } from "../utils/functions/economy/tasks";
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
  text: string;
  action: string;
  aliases?: string[];
};

const actions: Record<string, RoleplayAction> = {
  kiss: {
    gifs: [
      "https://c.tenor.com/N57Xg6F8-vYAAAAd/tenor.gif",
      "https://c.tenor.com/W-R9sPkk_IMAAAAd/tenor.gif",
      "https://c.tenor.com/cIMCczKDW8oAAAAd/tenor.gif",
    ],
    text: "{sender} {action} {target}!! cute",
    action: "kissed",
  },
  hug: {
    gifs: [
      "https://c.tenor.com/ac3otYT77RcAAAAd/tenor.gif",
      "https://c.tenor.com/2s-NG_10o4MAAAAd/tenor.gif",
      "https://c.tenor.com/o8lR_BGgZCgAAAAd/tenor.gif",
      "https://c.tenor.com/wSJZSQqIHhUAAAAd/tenor.gif",
    ],
    text: "{sender} {action} {target}!! awww",
    action: "hugged",
    aliases: ["cuddle"],
  },
  punch: {
    gifs: [
      "https://c.tenor.com/wSB-uAoR48UAAAAC/tenor.gif",
      "https://c.tenor.com/6Cp5tiRwh-YAAAAC/tenor.gif",
    ],
    text: "{sender} {action} {target}!! ouch",
    action: "punched",
  },
  slap: {
    gifs: [
      "https://c.tenor.com/j5rPRPBwSOMAAAAd/tenor.gif",
      "https://c.tenor.com/ysk3CJtdi60AAAAC/tenor.gif",
    ],
    text: "{sender} {action} {target}!! yikes",
    action: "slapped",
  },
  boop: {
    gifs: ["https://c.tenor.com/88HZjGgr3k0AAAAd/tenor.gif"],
    text: "{sender} {action} {target}!! awwwww",
    action: "booped",
  },
  sex: {
    gifs: [
      "https://c.tenor.com/9bVN6z6kJlMAAAAC/tenor.gif",
      "https://c.tenor.com/NHtslet7pEEAAAAd/tenor.gif",
    ],
    text: "{sender} {action} {target}!! hehehe",
    action: "had sex with",
    aliases: ["fuck"],
  },
  spank: {
    gifs: [
      "https://c.tenor.com/KI2iIP6dFTcAAAAC/tenor.gif",
      "https://c.tenor.com/fF3_SJgiUDgAAAAC/tenor.gif",
    ],
    text: "{sender} {action} {target}!!",
    action: "spanked",
  },
  flirt: {
    gifs: [
      "https://c.tenor.com/rt23AR7cgwUAAAAd/tenor.gif",
      "https://c.tenor.com/ikB16DROyTEAAAAd/tenor.gif",
      "https://c.tenor.com/H25zF6Pu734AAAAC/tenor.gif",
    ],
    text: "{sender} {action} {target}!!",
    action: "flirted with",
  },
  lick: {
    gifs: [
      "https://c.tenor.com/1w_SiTTl8joAAAAd/tenor.gif",
      "https://c.tenor.com/K9_q0nhLQyEAAAAC/tenor.gif",
    ],
    text: "{sender} {action} {target}!! yummy",
    action: "licked",
  },
  peg: {
    gifs: [
      "https://c.tenor.com/yG-niONE83sAAAAd/tenor.gif",
      "https://c.tenor.com/uBwsOmhiUBoAAAAd/tenor.gif",
    ],
    text: "{sender} {action} {target}!! freaky..",
    action: "pegged",
  },
  bite: {
    gifs: [
      "https://c.tenor.com/gTQqusq0Kt8AAAAd/tenor.gif",
      "https://c.tenor.com/FlNpqVlWb6YAAAAd/tenor.gif",
      "https://c.tenor.com/0_D9iWPRVAUAAAAd/tenor.gif",
    ],
    text: "{sender} {action} {target}!! chomp",
    action: "bit",
  },
  squirt: {
    gifs: [
      "https://c.tenor.com/BpMZTkzYG9oAAAAC/tenor.gif",
      "https://c.tenor.com/vzB4NFf84lMAAAAC/tenor.gif",
    ],
    text: "{sender} {action} {target}!! messy",
    action: "squirted on",
  },
  pat: {
    gifs: [
      "https://c.tenor.com/f5asRSsfl-wAAAAC/tenor.gif",
      "https://c.tenor.com/9PAkJvbE6R0AAAAC/tenor.gif",
      "https://c.tenor.com/gERa1EVU2ocAAAAd/tenor.gif",
    ],
    text: "{sender} gave {target} head pats!! there there",
    action: "gave head pats to",
    aliases: ["headpat"],
  },
  apologise: {
    gifs: [
      "https://c.tenor.com/XhK036RdGdUAAAAC/tenor.gif",
      "https://c.tenor.com/sIf1VJDSfSkAAAAC/tenor.gif",
    ],
    text: "{sender} {action} {target}!!",
    action: "apologised to",
    aliases: ["apologize", "apology", "sorry"],
  },
};

const cmd = new Command("rp", "roleplay actions", "fun").setAliases(["roleplay"]);

// build shorthands from actions: kiss -> rp kiss, hug -> rp hug, cuddle -> rp hug
cmd.setShorthands(
  Object.fromEntries([
    ...Object.keys(actions).map((name) => [name, `rp ${name}`]),
    ...Object.entries(actions).flatMap(([name, data]) =>
      (data.aliases ?? []).map((alias) => [alias, `rp ${name}`]),
    ),
  ]),
);

cmd.slashEnabled = true;

for (const [action] of Object.entries(actions)) {
  cmd.slashData.addSubcommand((sub) =>
    sub
      .setName(action)
      .setDescription(`${action} someone`)
      .addUserOption((opt) =>
        opt.setName("target").setDescription(`the person to ${action}`).setRequired(true),
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
        actionTotals
          .map((r) => `\`${r.action}\` ${r.count.toLocaleString()} ${pluralize("time", r.count)}`)
          .join("\n"),
        true,
      );

      embed.addField(
        "most actioned users",
        targetTotals
          .map((t) => `**${t.username}** ${t.count.toLocaleString()} ${pluralize("time", t.count)}`)
          .join("\n"),
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
            (r, i) =>
              `${i + 1}. **${r.target.lastKnownUsername}** ${r.count.toLocaleString()} ${pluralize("time", r.count)}`,
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
    const list = `\`${Object.keys(actions).join("`, `")}\``;

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

  if (
    action === "sex" &&
    (await redis.exists(`${Constants.redis.cooldown.SEX_CHASTITY}:${message.author.id}`)) == 1
  ) {
    const init = parseInt(
      await redis.get(`${Constants.redis.cooldown.SEX_CHASTITY}:${message.author.id}`),
    );
    const remaining = MStoTime(Date.now() + 10800000 - init);
    return send({
      embeds: [
        new ErrorEmbed(
          `you can't have sex when you're wearing a chastity cage!! it'll be removed in **${remaining}**`,
        ),
      ],
    });
  }

  await addCooldown(cmd.name, message.member, 3);

  let target: GuildMember;

  if (args[1]) {
    target = await getMember(message.guild, args.slice(1).join(" "));
    if (!target) {
      return send({ embeds: [new ErrorEmbed("couldn't find that user")] });
    }
  }

  if (!target) {
    return send({ embeds: [new ErrorEmbed(`you need to specify someone to ${action}`)] });
  }

  if (target.user.id === message.author.id) {
    return send({ embeds: [new ErrorEmbed("you can't do that to yourself. loser.")] });
  }

  const senderName = message.author.username;
  const targetName = target.user.username;

  const text = actionData.text
    .replace("{sender}", senderName)
    .replace("{action}", actionData.action)
    .replace("{target}", targetName);

  const gif = actionData.gifs[Math.floor(Math.random() * actionData.gifs.length)];

  const count = await addRoleplayStat(message.author.id, target.user.id, action);
  addTaskProgress(message.author.id, "roleplay_daily", 1);

  const embed = new CustomEmbed(message.member)
    .setHeader(text, message.author.avatarURL())
    .setImage(gif);

  embed.setFooter({
    text: `you've ${actionData.action} ${targetName} ${count.toLocaleString()} ${pluralize("time", count)}`,
  });

  return send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
