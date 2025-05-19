import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { giveCaptcha, isLockedOut, passedCaptcha } from "../utils/functions/captcha";
import { getAdminLevel } from "../utils/functions/users/admin";
import { logger } from "../utils/logger";
import { getMember } from "../utils/functions/member";
import redis from "../init/redis";
import Constants from "../utils/Constants";
import prisma from "../init/database";

const cmd = new Command("captchatest", "test an account", "none");

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if ((await getAdminLevel(message.author.id)) < 1) return;

  if (args.length == 0) {
    return message.channel.send({ content: "dumbass" });
  }

  if (args.length == 2 && args[0].toLowerCase() == "verify") {
    const target = (await getMember(message.guild, args[1]));

    if (!target) {
      if (message instanceof Message) message.react("❌");
      return;
    }

    const res = await isLockedOut(target.id);

    if (!res) {
      if (message instanceof Message) message.react("➖");
      return;
    }

    const captcha = await prisma.captcha.update({
      where: {id : res.id },
      data: {
        solved: true,
        solvedAt: new Date(),
      }
    });
    
    await redis.del(`${Constants.redis.nypsi.LOCKED_OUT}:${target.id}`);
    await passedCaptcha(target, captcha, true);
    await redis.del(`${Constants.redis.cache.user.CAPTCHA_HISTORY}:${target.id}`);
    
    if (message instanceof Message) message.react("✅");
    return;
  }
  
  for (const user of args) {
    giveCaptcha(user, 2, true);
    logger.info(`admin: ${message.author.id} (${message.author.username}) gave ${user} captcha`);
  }

  if (!(message instanceof Message)) return;

  message.react("✅");
}

cmd.setRun(run);

module.exports = cmd;
