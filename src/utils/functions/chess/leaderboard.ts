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
import { topChessAvgRating, topChessFastestSolve, topChessSolved } from "../leaderboards/chess";
import { MemberResolvable } from "../member";

type ChessLeaderboardType = "solved" | "rating" | "fastest";

const LABELS: Record<ChessLeaderboardType, string> = {
  solved: "total solved",
  rating: "avg rating",
  fastest: "fastest solve",
};

export async function showChessLeaderboard(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  global: boolean,
) {
  let currentType: ChessLeaderboardType = "solved";
  let currentPage = 1;

  const fetchData = async (
    type: ChessLeaderboardType,
  ): Promise<{ pages: Map<number, string[]>; pos: number }> => {
    const member = message.member as MemberResolvable;
    if (global) {
      if (type === "solved") return topChessSolved("global", undefined, member);
      if (type === "rating") return topChessAvgRating("global", undefined, member);
      return topChessFastestSolve("global", undefined, member);
    } else {
      if (type === "solved") return topChessSolved("guild", message.guild, member);
      if (type === "rating") return topChessAvgRating("guild", message.guild, member);
      return topChessFastestSolve("guild", message.guild, member);
    }
  };

  let data = await fetchData(currentType);

  const title = () =>
    `chess ${LABELS[currentType]} ${global ? "[global]" : `for ${message.guild.name}`}`;

  const embed = () => {
    const e = new CustomEmbed(message.member).setHeader(
      title(),
      global ? message.client.user.avatarURL() : message.guild.iconURL(),
      global ? `https://nypsi.xyz/leaderboards/chess/${currentType}?ref=bot-lb` : null,
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
      (["solved", "rating", "fastest"] as ChessLeaderboardType[]).map((type) =>
        new ButtonBuilder()
          .setCustomId(type)
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
              .setCustomId("⬅")
              .setLabel("back")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(disabled || currentPage <= 1),
            new ButtonBuilder()
              .setCustomId("➡")
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
    let fail = false;

    const response = await msg
      .awaitMessageComponent({ filter, time: 30_000 })
      .then(async (collected) => {
        await collected.deferUpdate().catch(() => {
          fail = true;
          return pageManager();
        });
        return { res: collected.customId };
      })
      .catch(async () => {
        fail = true;
        await msg.edit({ components: rows(true) });
      });

    if (fail) return;
    if (!response) return;

    const { res } = response;

    if (res === "⬅") {
      if (currentPage > 1) currentPage--;
    } else if (res === "➡") {
      if (currentPage < data.pages.size) currentPage++;
    } else if (res === "solved" || res === "rating" || res === "fastest") {
      currentType = res;
      currentPage = 1;
      data = await fetchData(currentType);
    }

    await msg.edit({ embeds: [embed()], components: rows() });
    return pageManager();
  };

  return pageManager();
}
