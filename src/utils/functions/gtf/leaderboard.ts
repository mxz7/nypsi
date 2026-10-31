import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import redis from "../../../init/redis";
import { NypsiCommandInteraction, NypsiMessage, SendMessage } from "../../../models/Command";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { topGTFFastest, topGTFWins } from "../leaderboards/gtf";
import { MemberResolvable } from "../member";

type GTFLeaderboardType = "wins" | "fastest";

const LABELS: Record<GTFLeaderboardType, string> = {
  wins: "total wins",
  fastest: "fastest win",
};

export async function showGTFLeaderboard(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  global: boolean,
) {
  let currentType: GTFLeaderboardType = "wins";
  let currentPage = 1;

  const fetchData = async (
    type: GTFLeaderboardType,
  ): Promise<{ pages: Map<number, string[]>; pos: number }> => {
    const member = message.member as MemberResolvable;
    if (global) {
      if (type === "wins") return topGTFWins("global", undefined, member);
      return topGTFFastest("global", undefined, member);
    } else {
      if (type === "wins") return topGTFWins("guild", message.guild, member);
      return topGTFFastest("guild", message.guild, member);
    }
  };

  let data = await fetchData(currentType);

  const title = () =>
    `guess the flag ${LABELS[currentType]} ${global ? "[global]" : `for ${message.guild.name}`}`;

  const embed = () => {
    const e = new CustomEmbed(message.member).setHeader(
      title(),
      global ? message.client.user.avatarURL() : message.guild.iconURL(),
      global
        ? `https://nypsi.xyz/leaderboards/flag/${currentType === "wins" ? "wins" : "time"}?ref=bot-lb`
        : null,
    );

    if (data.pages.size === 0) {
      e.setDescription("no data to show");
    } else {
      e.setDescription(data.pages.get(currentPage).join("\n"));
    }

    if (data.pos !== 0) {
      e.setFooter({ text: `you are #${data.pos}` });
    }

    return e;
  };

  const rows = (disabled = false) => [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      (["wins", "fastest"] as GTFLeaderboardType[]).map((type) =>
        new ButtonBuilder()
          .setCustomId(`btn-view-gtf-${type}-leaderboard`)
          .setLabel(LABELS[type])
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || currentType === type),
      ),
    ),
    ...(data.pages.size <= 1
      ? []
      : [
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("btn-previous-page")
              .setLabel("back")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(disabled || currentPage <= 1),
            new ButtonBuilder()
              .setCustomId("btn-next-page")
              .setLabel("next")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(disabled || currentPage >= data.pages.size),
          ),
        ]),
  ];

  if (
    data.pos === 1 &&
    message instanceof Message &&
    !(await redis.exists(`nypsi:cd:topemoji:${message.channelId}`))
  ) {
    await redis.set(`nypsi:cd:topemoji:${message.channelId}`, "boobies", "EX", 3);
    message.react("👑");
  }

  const msg = await send({ embeds: [embed()], components: rows() });

  const filter = (i: Interaction) => i.user.id === message.author.id;

  const pageManager: () => Promise<void> = async () => {
    const collected = await msg
      .awaitMessageComponent({ filter, time: 30_000 })
      .catch((): undefined => undefined);

    if (!collected) {
      await msg.edit({ components: rows(true) });
      return;
    }

    const defer = setTimeout(() => {
      collected.deferUpdate().catch(() => {});
    }, 2500);
    const res = collected.customId;

    if (res === "btn-previous-page") {
      if (currentPage > 1) currentPage--;
    } else if (res === "btn-next-page") {
      if (currentPage < data.pages.size) currentPage++;
    } else if (res.startsWith("btn-view-gtf-") && res.endsWith("-leaderboard")) {
      currentType = res.slice("btn-view-gtf-".length, -"-leaderboard".length) as GTFLeaderboardType;
      currentPage = 1;
      data = await fetchData(currentType);
    }

    clearTimeout(defer);

    const payload = { embeds: [embed()], components: rows() };
    await collected.update(payload).catch(() => msg.edit(payload));
    return pageManager();
  };

  return pageManager();
}
