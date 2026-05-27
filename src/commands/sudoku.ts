import { ComponentType, Message, MessageFlags } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { createUser, userExists } from "../utils/functions/economy/utils";
import { formatTime } from "../utils/functions/string";
import {
  createSudokuGame,
  getActiveGame,
  getSudokuStats,
  getUserCoordMode,
  setUserCoordMode,
  SudokuCoordMode,
  SudokuDifficulty,
} from "../utils/functions/sudoku/game";
import { buildConfirmationMessage, buildGameMessage } from "../utils/functions/sudoku/ui";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const DIFFICULTIES: SudokuDifficulty[] = ["easy", "medium", "hard", "expert"];

const cmd = new Command("sudoku", "play sudoku puzzles", "fun");

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((sub) => sub.setName("help").setDescription("how to play sudoku"))
  .addSubcommand((sub) =>
    sub
      .setName("play")
      .setDescription("play or resume a sudoku game")
      .addStringOption((opt) =>
        opt
          .setName("difficulty")
          .setDescription("puzzle difficulty (default: medium)")
          .setRequired(false)
          .addChoices(DIFFICULTIES.map((d) => ({ name: d, value: d }))),
      ),
  )
  .addSubcommand((sub) => sub.setName("stats").setDescription("view your sudoku stats"));

async function run(
  message: NypsiMessage | NypsiCommandInteraction,
  send: SendMessage,
  args: string[],
) {
  if (!(await userExists(message.member))) await createUser(message.member);

  const subcommand =
    !(message instanceof Message) && message.isChatInputCommand()
      ? message.options.getSubcommand()
      : args[0]?.toLowerCase();

  if (!subcommand || subcommand === "help") {
    const embed = new CustomEmbed(
      message.member,
      "**/sudoku play [difficulty]** *play a new sudoku puzzle*\n" +
        `- difficulty: ${DIFFICULTIES.map((d) => `\`${d}\``).join(", ")}\n` +
        "**/sudoku stats** *view your sudoku stats*",
    )
      .setHeader("sudoku", message.author.avatarURL())
      .addField(
        "rules",
        "- the board is a 9×9 grid split into nine 3×3 boxes\n" +
          "- some cells are already filled in, you can't change those\n" +
          "- fill in the empty cells using the numbers **1–9**\n" +
          "- each **row** must contain every number from 1–9 exactly once\n" +
          "- each **column** must contain every number from 1–9 exactly once\n" +
          "- each **3×3 box** must contain every number from 1–9 exactly once",
      )
      .addField(
        "coordinate modes",
        "- **box** — identify cells by box (A–I) then position within the box (1–9)\n" +
          "- **coordinates** — identify cells by column (A–I) and row (1–9)",
      );

    return send({ embeds: [embed] });
  }

  if (subcommand === "stats") {
    await addCooldown(cmd.name, message.member, 5);

    const stats = await getSudokuStats(message.author.id);

    if (stats.gamesStarted === 0) {
      return send({
        embeds: [
          new CustomEmbed(
            message.member,
            "you haven't played any sudoku yet. use **/sudoku play** to begin!",
          ),
        ],
      });
    }

    const embed = new CustomEmbed(message.member);
    embed.setHeader(`${message.author.username}'s sudoku stats`, message.author.avatarURL());

    embed.setDescription(
      [
        `games started: \`${stats.gamesStarted.toLocaleString()}\``,
        `games solved: \`${stats.gamesCompleted.toLocaleString()}\``,
        `solve rate: \`${stats.solvePercent}%\``,
        `avg mistakes: \`${stats.avgMistakes}\``,
      ].join("\n"),
    );

    for (const diff of stats.byDifficulty) {
      const lines: string[] = [`completed: \`${diff.completed}\``];
      if (diff.fastestMs !== null) lines.push(`fastest: \`${formatTime(diff.fastestMs)}\``);
      if (diff.avgMs !== null) lines.push(`avg time: \`${formatTime(diff.avgMs)}\``);
      embed.addField(diff.difficulty, lines.join("\n"), true);
    }

    return send({ embeds: [embed] });
  }

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);
    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }
  await addCooldown(cmd.name, message.member, 5);

  let difficulty: SudokuDifficulty = "easy";
  if (!(message instanceof Message) && message.isChatInputCommand()) {
    difficulty = (message.options.getString("difficulty") as SudokuDifficulty) ?? "easy";
  } else if (args[1] && (DIFFICULTIES as string[]).includes(args[1].toLowerCase())) {
    difficulty = args[1].toLowerCase() as SudokuDifficulty;
  } else if (args[0] && (DIFFICULTIES as string[]).includes(args[0].toLowerCase())) {
    difficulty = args[0].toLowerCase() as SudokuDifficulty;
  }

  const [activeGame, coordMode] = await Promise.all([
    getActiveGame(message.author.id),
    getUserCoordMode(message.author.id),
  ]);

  if (activeGame) {
    return send(await buildGameMessage(activeGame, coordMode, message.author.avatarURL()));
  }

  let currentMode: SudokuCoordMode = coordMode;

  const msg = await send(
    buildConfirmationMessage(difficulty, currentMode, message.author.avatarURL()),
  );

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === message.author.id,
    time: 120_000,
  });

  collector.on("collect", async (interaction) => {
    if (interaction.customId === "sudoku-coord-toggle") {
      currentMode = currentMode === "box" ? "coordinates" : "box";
      await setUserCoordMode(message.author.id, currentMode);
      await interaction.update(
        buildConfirmationMessage(difficulty, currentMode, message.author.avatarURL()),
      );
    } else if (interaction.customId === "sudoku-confirm-start") {
      collector.stop("started");
      const game = await createSudokuGame(message.author.id, difficulty);
      await interaction.update(
        await buildGameMessage(game, currentMode, message.author.avatarURL()),
      );
    }
  });

  collector.on("end", (_, reason) => {
    if (reason !== "started") {
      msg.edit({ components: [] }).catch(() => {});
    }
  });
}

cmd.setRun(run);

module.exports = cmd;
