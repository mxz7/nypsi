import { exec } from "child_process";
import { CommandInteraction, Message } from "discord.js";
import { readFile } from "fs/promises";
import { nanoid } from "nanoid";
import { promisify } from "util";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { uploadImage } from "../utils/functions/image";
import { getAdminLevel } from "../utils/functions/users/admin";
import { logger } from "../utils/logger";

const cmd = new Command("logsearch", "search through logs", "none").setPermissions(["bot owner"]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if ((await getAdminLevel(message.author.id)) < 3) return;

  if (args.length == 0) return;

  const before = performance.now();

  const path = `/tmp/nypsi_logsearch_results_${Date.now()}.txt`;

  const execCmd = promisify(exec);

  logger.debug("grep");

  const msg = message.channel.send({ content: "searching..." });

  const success = await execCmd(
    `grep -rh "${args.join(" ").replaceAll('"', "").replaceAll("\\", "")}" out > ${path}`,
  ).catch((err) => {
    console.error(err);
    logger.error("failed to complete logsearch", {err});
  });

  if (!success) return (await msg).edit({ content: "failed to search logs" });

  logger.debug("processing");
  (await msg).edit({ content: "processing..." });

  const res = await fetch("https://nypsi-logprocess.fly.dev/process", {
    method: "POST",
    headers: { authorization: process.env.LOGSEARCH_TOKEN },
    body: await readFile(path),
  });

  if (!res.ok) {
    console.error(res);
    logger.error("failed processing logs", res);
    return (await msg).edit({ content: "failed processing logs" });
  }

  logger.debug("uploading");
  (await msg).edit({ content: "uploading..." });

  const buffer = Buffer.from(await res.arrayBuffer());

  if (!path) {
    if (!(message instanceof Message)) return;
    return message.react("❌");
  }

  const after = performance.now();

  if (buffer.byteLength > 1e7) {
    const id = `search_result/${nanoid()}.txt`;

    await uploadImage(id, buffer, "text/plain");

    return (await msg).edit({
      content:
        `results for \`${args.join(" ")}\` in ${((after - before) / 1000).toFixed(2)}s\n\n` +
        `https://cdn.nypsi.xyz/${id}`,
    });
  } else {
    return (await msg).edit({
      content: `results for \`${args.join(" ")}\` in ${((after - before) / 1000).toFixed(2)}s`,
      files: [{ attachment: buffer, name: "search_results.txt" }],
    });
  }
}

cmd.setRun(run);

module.exports = cmd;
