import { CaptchaGenerator } from "captcha-canvas";
import { CommandInteraction, GuildMember, Message, WebhookClient } from "discord.js";
import * as crypto from "node:crypto";
import redis from "../../init/redis";
import { NypsiCommandInteraction } from "../../models/Command";
import { CustomEmbed } from "../../models/EmbedBuilders";
import Constants from "../Constants";
import { getTimestamp, logger } from "../logger";
import ms = require("ms");

const beingVerified = new Set<string>();

const colors = ["deeppink", "green", "red", "blue"];

const generator = new CaptchaGenerator().setDecoy({ opacity: 0.6, total: 15 });

const captchaFails = new Map<string, number>();
const captchaPasses = new Map<string, number>();

export async function isLockedOut(userId: string) {
  return Boolean(await redis.sismember(Constants.redis.nypsi.LOCKED_OUT, userId));
}

export async function toggleLock(userId: string) {
  if (await isLockedOut(userId)) {
    await redis.srem(Constants.redis.nypsi.LOCKED_OUT, userId);
  } else {
    if (await isVerified(userId)) return;
    await redis.sadd(Constants.redis.nypsi.LOCKED_OUT, userId);
  }
}

export async function createCaptcha() {
  let text = crypto.randomBytes(32).toString("hex");

  text = text.substring(0, Math.floor(Math.random() * 3) + 6);

  generator.setCaptcha({ colors, text });
  return { captcha: await generator.generate(), text };
}

async function isVerified(id: string) {
  return await redis.exists(`${Constants.redis.nypsi.CAPTCHA_VERIFIED}:${id}`);
}

export async function passedCaptcha(member: GuildMember) {
  const hook = new WebhookClient({
    url: process.env.ANTICHEAT_HOOK,
  });

  if (captchaPasses.has(member.user.id)) {
    captchaPasses.set(member.user.id, captchaPasses.get(member.user.id) + 1);
  } else {
    captchaPasses.set(member.user.id, 1);
  }

  await hook.send(
    `[${getTimestamp()}] **${member.user.tag}** (${member.user.id}) has passed a captcha (${captchaPasses.get(
      member.user.id
    )})`
  );

  await redis.set(`${Constants.redis.nypsi.CAPTCHA_VERIFIED}:${member.user.id}`, member.user.id);
  await redis.expire(`${Constants.redis.nypsi.CAPTCHA_VERIFIED}:${member.user.id}`, ms("30 minutes") / 1000);
}

export async function failedCaptcha(member: GuildMember) {
  const hook = new WebhookClient({
    url: process.env.ANTICHEAT_HOOK,
  });

  if (captchaFails.has(member.user.id)) {
    captchaFails.set(member.user.id, captchaFails.get(member.user.id) + 1);
  } else {
    captchaFails.set(member.user.id, 1);
  }

  await hook.send(
    `[${getTimestamp()}] **${member.user.tag}** (${member.user.id}) has failed a captcha (${captchaFails.get(
      member.user.id
    )})`
  );
}

export async function verifyUser(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (beingVerified.has(message.author.id)) return;

  const { captcha, text } = await createCaptcha();

  const embed = new CustomEmbed(message.member).setTitle("you have been locked");

  embed.setDescription(
    "please note that using macros / auto typers is not allowed with nypsi\n\nplease type the following:"
  );

  embed.setImage("attachment://captcha.png");

  beingVerified.add(message.author.id);

  await message.channel.send({
    content: message.author.toString(),
    embeds: [embed],
    files: [
      {
        attachment: captcha,
        name: "captcha.png",
      },
    ],
  });

  logger.info(`sent captcha (${message.author.id}) - awaiting reply`);

  const filter = (m: Message) => m.author.id == message.author.id;

  let fail = false;

  const response = await message.channel
    .awaitMessages({ filter, max: 1, time: 30000, errors: ["time"] })
    .then(async (collected) => {
      return collected.first();
    })
    .catch(() => {
      fail = true;
      logger.info(`captcha (${message.author.id}) failed`);
      failedCaptcha(message.member);
      message.channel.send({
        content: message.author.toString() + " captcha failed, please **type** the letter/number combination shown",
      });
    });

  beingVerified.delete(message.author.id);

  if (fail) return;
  if (!response) return;

  if (response.content.toLowerCase() == text) {
    logger.info(`captcha (${message.author.id}) passed`);
    passedCaptcha(message.member);
    toggleLock(message.author.id);
    return response.react("✅");
  } else {
    logger.info(`${message.guild} - ${message.author.tag}: ${message.content}`);
    logger.info(`captcha (${message.author.id}) failed`);
    failedCaptcha(message.member);
    return message.channel.send({
      content: message.author.toString() + " captcha failed, please **type** the letter/number combination shown",
    });
  }
}
