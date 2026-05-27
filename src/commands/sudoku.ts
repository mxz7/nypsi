import { Message, MessageFlags } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { createUser, userExists } from "../utils/functions/economy/utils";
import { formatTime } from "../utils/functions/string";
import {
  getActiveGame,
  getSudokuStats,
  getUserCoordMode,
  SudokuDifficulty,
} from "../utils/functions/sudoku/game";
import { buildConfirmationMessage, buildGameMessage } from "../utils/functions/sudoku/ui";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const DIFFICULTIES: SudokuDifficulty[] = ["easy", "medium", "hard", "expert"];

const cmd = new Command("sudoku", "play sudoku puzzles", "fun");

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((sub) =>
    sub
      .setName("start")
      .setDescription("start or resume a sudoku game")
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

  if (args[0]?.toLowerCase() === "stats") {
    await addCooldown(cmd.name, message.member, 5);

    const stats = await getSudokuStats(message.author.id);

    if (stats.gamesStarted === 0) {
      return send({
        embeds: [
          new CustomEmbed(
            message.member,
            "you haven't played any sudoku yet.\n\nuse **/sudoku start** to begin!",
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

  let difficulty: SudokuDifficulty = "medium";
  if (!(message instanceof Message) && message.isChatInputCommand()) {
    difficulty = (message.options.getString("difficulty") as SudokuDifficulty) ?? "medium";
  } else if (args[1] && (DIFFICULTIES as string[]).includes(args[1].toLowerCase())) {
    difficulty = args[1].toLowerCase() as SudokuDifficulty;
  }

  const [activeGame, coordMode] = await Promise.all([
    getActiveGame(message.author.id),
    getUserCoordMode(message.author.id),
  ]);

  if (activeGame) {
    return send(await buildGameMessage(activeGame, coordMode));
  }

  return send(buildConfirmationMessage(difficulty, coordMode));
}

cmd.setRun(run);

export default cmd;
