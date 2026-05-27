import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { NypsiCommandInteraction, NypsiMessage, SendMessage } from "../../../models/Command";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { topSudokuFastest, topSudokuWins } from "../leaderboards/sudoku";
import { MemberResolvable } from "../member";

type SudokuLeaderboardType = "wins" | "fastest";

const LABELS: Record<SudokuLeaderboardType, string> = {
  wins: "total solves",
  fastest: "fastest solve",
};

export async function showSudokuLeaderboard(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  global: boolean,
) {
  let currentType: SudokuLeaderboardType = "wins";
  let currentPage = 1;

  const fetchData = async (type: SudokuLeaderboardType) => {
    const member = message.member as MemberResolvable;
    if (global) {
      if (type === "wins") return topSudokuWins("global", undefined, member);
      return topSudokuFastest("global", undefined, member);
    } else {
      if (type === "wins") return topSudokuWins("guild", message.guild, member);
      return topSudokuFastest("guild", message.guild, member);
    }
  };

  let data = await fetchData(currentType);

  const title = () =>
    `sudoku ${LABELS[currentType]} ${global ? "[global]" : `for ${message.guild.name}`}`;

  const embed = () => {
    const e = new CustomEmbed(message.member).setHeader(
      title(),
      global ? message.client.user.avatarURL() : message.guild.iconURL(),
    );

    if (data.pages.size === 0) {
      e.setDescription("no data yet");
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
      (["wins", "fastest"] as SudokuLeaderboardType[]).map((type) =>
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
    } else if (res === "wins" || res === "fastest") {
      currentType = res;
      currentPage = 1;
      data = await fetchData(currentType);
    }

    await msg.edit({ embeds: [embed()], components: rows() });
    return pageManager();
  };

  return pageManager();
}
