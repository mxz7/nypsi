import {
  ActionRowBuilder,
  APIApplicationCommandOptionChoice,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Message,
  MessageActionRowComponentBuilder,
  MessageFlags,
} from "discord.js";
import redis from "../init/redis";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { Item } from "../types/Economy.js";
import { getGuildByUser } from "../utils/functions/economy/guilds";
import { selectItem } from "../utils/functions/economy/inventory";
import {
  topBalance,
  topChatReaction,
  topChatReactionGlobal,
  topCommand,
  topCommandGlobal,
  topCommandUses,
  topCommandUsesGlobal,
  topCompletion,
  topDailyStreak,
  topDailyStreakGlobal,
  topGuilds,
  topItem,
  topItemGlobal,
  topLottoWins,
  topLottoWinsGlobal,
  topNetWorth,
  topNetWorthGlobal,
  topPrestige,
  topPrestigeGlobal,
  topVote,
  topVoteGlobal,
  topVoteStreak,
  topVoteStreakGlobal,
  topWordle,
  topWordleGlobal,
  topWordleTime,
  topWordleTimeGlobal,
} from "../utils/functions/economy/top";
import { getItems } from "../utils/functions/economy/utils.js";
import { getPrefix } from "../utils/functions/guilds/utils";
import PageManager from "../utils/functions/page";
import {
  commandAliasExists,
  commandExists,
  getCommandFromAlias,
} from "../utils/handlers/commandhandler";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler.js";

const cmd = new Command("top", "view top etc. in the server", "money").setAliases([
  "baltop",
  "gangsters",
  "leaderboard",
  "lb",
]);

const scopeChoices: APIApplicationCommandOptionChoice<string>[] = [
  { name: "global", value: "global" },
  { name: "server", value: "server" },
];

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((balance) =>
    balance.setName("balance").setDescription("view top balances in the server"),
  )
  .addSubcommand((prestige) =>
    prestige
      .setName("prestige")
      .setDescription("view top prestiges in the server")
      .addStringOption((option) =>
        option
          .setName("scope")
          .setDescription("show global/server")
          .setChoices(...scopeChoices)
          .setRequired(false),
      ),
  )
  .addSubcommand((prestige) =>
    prestige
      .setName("vote")
      .setDescription("view top monthly votes in the server")
      .addStringOption((option) =>
        option
          .setName("scope")
          .setDescription("show global/server")
          .setChoices(...scopeChoices)
          .setRequired(false),
      ),
  )
  .addSubcommand((prestige) =>
    prestige
      .setName("dailystreak")
      .setDescription("view top daily streaks in the server")
      .addStringOption((option) =>
        option
          .setName("scope")
          .setDescription("show global/server")
          .setChoices(...scopeChoices)
          .setRequired(false),
      ),
  )
  .addSubcommand((prestige) =>
    prestige
      .setName("lottery")
      .setDescription("view top lottery wins in the server")
      .addStringOption((option) =>
        option
          .setName("scope")
          .setDescription("show global/server")
          .setChoices(...scopeChoices)
          .setRequired(false),
      ),
  )
  .addSubcommand((prestige) =>
    prestige
      .setName("wordle")
      .setDescription("view top wordle wins in the server")
      .addStringOption((option) =>
        option
          .setName("scope")
          .setDescription("show global/server")
          .setChoices(...scopeChoices)
          .setRequired(false),
      ),
  )
  .addSubcommand((item) =>
    item
      .setName("item")
      .setDescription("view top item holders in the server")
      .addStringOption((option) =>
        option
          .setName("item-global")
          .setDescription("item to query")
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addStringOption((option) =>
        option
          .setName("scope")
          .setDescription("show global/server")
          .setChoices(...scopeChoices)
          .setRequired(false),
      ),
  )
  .addSubcommand((guild) => guild.setName("guilds").setDescription("view top nypsi guilds"))
  .addSubcommand((completion) =>
    completion.setName("completion").setDescription("view top completion in the server"),
  )
  .addSubcommand((networth) =>
    networth
      .setName("networth")
      .setDescription("view top networths in the server")

      .addStringOption((option) =>
        option
          .setName("scope")
          .setDescription("show global/server")
          .setChoices(...scopeChoices)
          .setRequired(false),
      ),
  )
  .addSubcommand((command) =>
    command
      .setName("command")
      .setDescription("view top command uses in the server")

      .addStringOption((option) =>
        option
          .setName("scope")
          .setDescription("show global/server")
          .setChoices(...scopeChoices)
          .setRequired(false),
      ),
  )
  .addSubcommand((cmd) =>
    cmd
      .setName("cr-daily")
      .setDescription("view fastest daily chat reaction wins")
      .addStringOption((option) =>
        option
          .setName("scope")
          .setDescription("show global/server")
          .setChoices(...scopeChoices)
          .setRequired(false),
      ),
  )
  .addSubcommand((cmd) =>
    cmd
      .setName("cr-global")
      .setDescription("view fastest global chat reaction wins")
      .addStringOption((option) =>
        option
          .setName("scope")
          .setDescription("show global/server")
          .setChoices(...scopeChoices)
          .setRequired(false),
      ),
  )
  .addSubcommand((cmd) =>
    cmd
      .setName("votestreak")
      .setDescription("view highest vote streaks")
      .addStringOption((option) =>
        option
          .setName("scope")
          .setDescription("show global/server")
          .setChoices(...scopeChoices)
          .setRequired(false),
      ),
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

  await addCooldown(cmd.name, message.member, 5);

  const show = async (
    pages: Map<number, string[]>,
    pos: number,
    title: string,
    url?: string,
    footer?: string,
  ) => {
    const embed = new CustomEmbed(message.member).setHeader(
      title,
      title.includes("global") || title.includes("guild")
        ? message.client.user.avatarURL()
        : message.guild.iconURL(),
      url,
    );

    if (pages.size == 0) {
      embed.setDescription("no data to show");
    } else {
      embed.setDescription(pages.get(1).join("\n"));
    }

    if (pos != 0) {
      embed.setFooter({ text: `you are #${pos}${footer ? "| " + footer : ""}` });
    } else if (footer) {
      embed.setFooter({ text: footer });
    }

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("⬅")
        .setLabel("back")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
    );

    if (
      pos === 1 &&
      message instanceof Message &&
      !(await redis.exists(`nypsi:cd:topemoji:${message.channelId}`))
    ) {
      await redis.set(`nypsi:cd:topemoji:${message.channelId}`, "boobies", "EX", 3);
      message.react("👑");
    }

    if (pages.size <= 1) {
      return send({ embeds: [embed] });
    }

    const msg = await send({ embeds: [embed], components: [row] });

    const manager = new PageManager({
      embed: embed,
      message: msg,
      row: row,
      userId: message.author.id,
      pages: pages,
      allowMessageDupe: true,
    });

    return manager.listen();
  };

  if (args.length == 0) {
    const data = await topBalance(message.guild, message.member);

    return show(data.pages, data.pos, `top balance for ${message.guild.name}`);
  } else if (args[0].toLowerCase() == "balance") {
    const data = await topBalance(message.guild, message.member);

    return show(data.pages, data.pos, `top balance for ${message.guild.name}`);
  } else if (args[0].toLowerCase() == "prestige" || args[0].toLowerCase() === "level") {
    let global = false;

    if (args[1]?.toLowerCase() == "global") global = true;

    let data: { pages: Map<number, string[]>; pos: number };

    if (global) {
      data = await topPrestigeGlobal(message.member);
    } else {
      data = await topPrestige(message.guild, message.member);
    }

    return show(
      data.pages,
      data.pos,
      `top prestige ${global ? "[global]" : `for ${message.guild.name}`}`,
      global ? "https://nypsi.xyz/leaderboards/level?ref=bot-lb" : null,
    );
  } else if (args[0].toLowerCase() == "item") {
    const items = getItems();

    if (args.length == 1) {
      return send({ embeds: [new ErrorEmbed("/top item <item>")] });
    }

    const searchTag = args[1].toLowerCase();

    let item: Item;

    for (const itemName of Array.from(Object.keys(items))) {
      const aliases = items[itemName].aliases ? items[itemName].aliases : [];
      if (searchTag == itemName) {
        item = items[itemName];
        break;
      } else if (searchTag == itemName.split("_").join("")) {
        item = items[itemName];
        break;
      } else if (aliases.indexOf(searchTag) != -1) {
        item = items[itemName];
        break;
      } else if (searchTag == items[itemName].name) {
        item = items[itemName];
        break;
      }
    }

    if (!item) {
      return send({ embeds: [new ErrorEmbed(`couldn't find ${searchTag}`)] });
    }

    if (item.id === "lottery_ticket")
      return send({ embeds: [new ErrorEmbed("leaderboards for this item are unavailable")] });

    let global = false;

    if (args[2]?.toLowerCase() == "global") global = true;

    let data: { pages: Map<number, string[]>; pos: number };

    if (global) {
      data = await topItemGlobal(item.id, message.member);
    } else {
      data = await topItem(message.guild, item.id, message.member);
    }

    return show(
      data.pages,
      data.pos,
      `top ${item.name} ${global ? "[global]" : `for ${message.guild.name}`}`,
      global ? `https://nypsi.xyz/leaderboards/${item.id}?ref=bot-lb` : null,
    );
  } else if (args[0].toLowerCase() == "completion") {
    const data = await topCompletion(message.guild, message.member);

    return show(data.pages, data.pos, `top completion in ${message.guild.name}`);
  } else if (args[0].toLowerCase() == "net" || args[0].toLowerCase() == "networth") {
    let global = false;

    if (args[1]?.toLowerCase() == "global") global = true;

    let data: { pages: Map<number, string[]>; pos: number };

    if (global) {
      data = await topNetWorthGlobal(message.member);
    } else {
      data = await topNetWorth(message.guild, message.member);
    }

    return show(
      data.pages,
      data.pos,
      `top net worth ${global ? "[global]" : `for ${message.guild.name}`}`,
      global ? "https://nypsi.xyz/leaderboards/net-worth?ref=bot-lb" : null,
    );
  } else if (args[0].toLowerCase() === "guild" || args[0].toLowerCase() === "guilds") {
    const userGuild = await getGuildByUser(message.member);

    const data = await topGuilds(userGuild?.guildName);

    return show(
      data.pages,
      data.pos,
      "top guilds",
      "https://nypsi.xyz/leaderboards/guilds?ref=bot-lb",
    );
  } else if (args[0].toLowerCase() === "streak" || args[0].toLowerCase() === "dailystreak") {
    let global = false;

    if (args[1]?.toLowerCase() == "global") global = true;

    let data: { pages: Map<number, string[]>; pos: number };

    if (global) {
      data = await topDailyStreakGlobal(message.member);
    } else {
      data = await topDailyStreak(message.guild, message.member);
    }

    return show(
      data.pages,
      data.pos,
      `top daily streak ${global ? "[global]" : `for ${message.guild.name}`}`,
      global ? "https://nypsi.xyz/leaderboards/streak?ref=bot-lb" : null,
    );
  } else if (args[0].toLowerCase() === "lottery") {
    let global = false;

    if (args[1]?.toLowerCase() == "global") global = true;

    let data: { pages: Map<number, string[]>; pos: number };

    if (global) {
      data = await topLottoWinsGlobal(message.member);
    } else {
      data = await topLottoWins(message.guild, message.member);
    }

    return show(
      data.pages,
      data.pos,
      `top lottery wins ${global ? "[global]" : `for ${message.guild.name}`}`,
      global ? "https://nypsi.xyz/leaderboards/lottery?ref=bot-lb" : null,
    );
  } else if (args[0].toLowerCase() === "wordle-time" || args[0].toLowerCase() === "wordletime") {
    let global = false;

    if (args[1]?.toLowerCase() == "global") global = true;

    let data: { pages: Map<number, string[]>; pos: number };

    if (global) {
      data = await topWordleTimeGlobal(message.member);
    } else {
      data = await topWordleTime(message.guild, message.member);
    }

    return show(
      data.pages,
      data.pos,
      `fastest wordle wins ${global ? "[global]" : `for ${message.guild.name}`}`,
      global ? "https://nypsi.xyz/leaderboards/wordle?ref=bot-lb" : null,
    );
  } else if (args[0].toLowerCase() === "wordle") {
    let global = false;

    if (args[1]?.toLowerCase() == "global") global = true;

    let data: { pages: Map<number, string[]>; pos: number };

    if (global) {
      data = await topWordleGlobal(message.member);
    } else {
      data = await topWordle(message.guild, message.member);
    }

    return show(
      data.pages,
      data.pos,
      `top wordle wins ${global ? "[global]" : `for ${message.guild.name}`}`,
      global ? "https://nypsi.xyz/leaderboards/wordle?ref=bot-lb" : null,
    );
  } else if (args[0].toLowerCase() === "votestreak") {
    let global = false;

    if (args[1]?.toLowerCase() == "global") global = true;

    let data: { pages: Map<number, string[]>; pos: number };

    if (global) {
      data = await topVoteStreakGlobal(message.member);
    } else {
      data = await topVoteStreak(message.guild, message.member);
    }

    return show(
      data.pages,
      data.pos,
      `top vote streak ${global ? "[global]" : `for ${message.guild.name}`}`,
    );
  } else if (args[0].toLowerCase() === "vote") {
    let global = false;

    if (args[1]?.toLowerCase() == "global") global = true;

    let data: { pages: Map<number, string[]>; pos: number };

    if (global) {
      data = await topVoteGlobal(message.member);
    } else {
      data = await topVote(message.guild, message.member);
    }

    return show(
      data.pages,
      data.pos,
      `top monthly votes ${global ? "[global]" : `for ${message.guild.name}`}`,
      global ? "https://nypsi.xyz/leaderboards/vote?ref=bot-lb" : null,
    );
  } else if (["cr", "crglobal", "cr-global", "chatreaction"].includes(args[0].toLowerCase())) {
    let global = false;

    if (args[1]?.toLowerCase() == "daily") {
      args.splice(1, 1);
      args[0] = "crdaily";
      await redis.del(`cd:top:${message.author.id}`);
      return run(message, send, args);
    }
    if (args[1]?.toLowerCase() == "global") global = true;

    let data: { pages: Map<number, string[]>; pos: number };

    if (global) {
      data = await topChatReactionGlobal(message.member, false);
    } else {
      data = await topChatReaction(message.guild, false, message.member);
    }

    return show(
      data.pages,
      data.pos,
      `top chat reaction ${global ? "[global]" : `for ${message.guild.name}`}`,
    );
  } else if (
    ["crdaily", "cr_daily", "cr-daily", "chatreactiondaily"].includes(args[0].toLowerCase())
  ) {
    let global = false;

    if (args[1]?.toLowerCase() == "global") global = true;

    let data: { pages: Map<number, string[]>; pos: number };

    if (global) {
      data = await topChatReactionGlobal(message.member, true);
    } else {
      data = await topChatReaction(message.guild, true, message.member);
    }

    return show(
      data.pages,
      data.pos,
      `top daily chat reaction ${global ? "[global]" : `for ${message.guild.name}`}`,
    );
  } else if (args[0].toLowerCase() === "cmd" || args[0].toLowerCase() === "command") {
    let data: { pages: Map<number, string[]>; pos: number };
    let title: string;
    let url: string;

    if (args.length === 1 || args[1]?.toLowerCase() === "global") {
      if (args[1]?.toLowerCase() === "global") {
        data = await topCommandUsesGlobal(message.member);
        title = `top command uses [global]`;
        url = "https://nypsi.xyz/leaderboards/commands?ref=bot-lb";
      } else {
        data = await topCommandUses(message.guild, message.member);
        title = `top command uses for ${message.guild.name}`;
      }
    } else {
      let cmd = args[1]?.toLowerCase();

      if (!commandExists(cmd)) {
        if (commandAliasExists(cmd)) {
          cmd = getCommandFromAlias(cmd);
        } else return send({ embeds: [new ErrorEmbed(`couldn't find ${cmd}`)] });
      }
      let global = false;

      if (args[2]?.toLowerCase() == "global") global = true;

      if (global) {
        data = await topCommandGlobal(cmd, message.member);
      } else {
        data = await topCommand(message.guild, cmd, message.member);
      }

      title = `top ${(await getPrefix(message.guild))[0]}${cmd} uses ${
        global ? "[global]" : `for ${message.guild.name}`
      }`;
    }

    return show(data.pages, data.pos, title, url);
  } else {
    const selected =
      selectItem(args.join(" ").toLowerCase()) ||
      selectItem(
        args
          .slice(0, args.length - 1)
          .join(" ")
          .toLowerCase(),
      ) ||
      selectItem(args[0].toLowerCase());

    if (!selected) return send({ embeds: [new ErrorEmbed("invalid option")] });

    if (selected.id === "lottery_ticket")
      return send({ embeds: [new ErrorEmbed("leaderboards for this item are unavailable")] });

    let global = false;

    if (args[args.length - 1].toLowerCase() == "global") global = true;

    let data: { pages: Map<number, string[]>; pos: number };

    if (global) {
      data = await topItemGlobal(selected.id, message.member);
    } else {
      data = await topItem(message.guild, selected.id, message.member);
    }

    return show(
      data.pages,
      data.pos,
      `top ${selected.name} ${global ? "[global]" : `for ${message.guild.name}`}`,
      global ? `https://nypsi.xyz/leaderboards/${selected.id}?ref=bot-lb` : null,
    );
  }
}

cmd.setRun(run);

module.exports = cmd;
