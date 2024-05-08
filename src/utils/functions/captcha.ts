import { CaptchaGenerator } from "captcha-canvas";
import { CommandInteraction, GuildMember, Message, WebhookClient } from "discord.js";
import * as crypto from "node:crypto";
import prisma from "../../init/database";
import redis from "../../init/redis";
import { NypsiClient } from "../../models/Client";
import { NypsiCommandInteraction } from "../../models/Command";
import { CustomEmbed } from "../../models/EmbedBuilders";
import Constants from "../Constants";
import { getTimestamp, logger } from "../logger";
import { isEcoBanned, setEcoBan } from "./economy/utils";
import requestDM from "./requestdm";
import ms = require("ms");
import dayjs = require("dayjs");

const beingVerified = new Set<string>();

const colors = ["deeppink", "green", "red", "blue"];

const generator = new CaptchaGenerator().setDecoy({ opacity: 0.6, total: 15 });

type CaptchaType1 = {
  type: 1;
};

type CaptchaType2 = {
  type: 2;
  id: string;
};

export async function isLockedOut(userId: string): Promise<false | CaptchaType1 | CaptchaType2> {
  const cache = await redis.get(`${Constants.redis.nypsi.LOCKED_OUT}:${userId}`);
  if (!cache) return false;

  return JSON.parse(cache);
}

export async function giveCaptcha(userId: string, type: 1 | 2 = 2, force = false) {
  if (!force && isVerified(userId)) return false;

  if (type === 2) {
    const id = await prisma.captcha.create({
      data: {
        userId,
      },
      select: {
        id: true,
      },
    });
    await redis.set(
      `${Constants.redis.nypsi.LOCKED_OUT}:${userId}`,
      JSON.stringify({ type: 2, id }),
    );
  } else {
    await redis.set(`${Constants.redis.nypsi.LOCKED_OUT}:${userId}`, JSON.stringify({ type: 1 }));
  }

  return true;
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

export async function passedCaptcha(member: GuildMember, meta?: string) {
  const hook = new WebhookClient({
    url: process.env.ANTICHEAT_HOOK,
  });

  if (await redis.exists(`${Constants.redis.cache.user.captcha_pass}:${member.user.id}`)) {
    const ttl = await redis.ttl(`${Constants.redis.cache.user.captcha_pass}:${member.user.id}`);
    await redis.set(
      `${Constants.redis.cache.user.captcha_pass}:${member.user.id}`,
      parseInt(await redis.get(`${Constants.redis.cache.user.captcha_pass}:${member.user.id}`)) + 1,
      "EX",
      ttl,
    );
  } else {
    await redis.set(
      `${Constants.redis.cache.user.captcha_pass}:${member.user.id}`,
      1,
      "EX",
      Math.floor(ms("1 day") / 1000),
    );
  }

  await hook.send(
    `[${getTimestamp()}] **${member.user.username}** (${
      member.user.id
    }) has passed a captcha [${await redis.get(
      `${Constants.redis.cache.user.captcha_pass}:${member.user.id}`,
    )}]${meta ? meta : ""}`,
  );

  await redis.set(`${Constants.redis.nypsi.CAPTCHA_VERIFIED}:${member.user.id}`, member.user.id);
  await redis.expire(
    `${Constants.redis.nypsi.CAPTCHA_VERIFIED}:${member.user.id}`,
    ms("30 minutes") / 1000,
  );
  hook.destroy();
}

export async function failedCaptcha(member: GuildMember, content: string) {
  const hook = new WebhookClient({
    url: process.env.ANTICHEAT_HOOK,
  });

  if (await redis.exists(`${Constants.redis.cache.user.captcha_fail}:${member.user.id}`)) {
    const ttl = await redis.ttl(`${Constants.redis.cache.user.captcha_fail}:${member.user.id}`);
    await redis.set(
      `${Constants.redis.cache.user.captcha_fail}:${member.user.id}`,
      parseInt(await redis.get(`${Constants.redis.cache.user.captcha_fail}:${member.user.id}`)) + 1,
      "EX",
      ttl,
    );
  } else {
    await redis.set(
      `${Constants.redis.cache.user.captcha_fail}:${member.user.id}`,
      1,
      "EX",
      Math.floor(ms("1 day") / 1000),
    );
  }

  if (
    parseInt(await redis.get(`${Constants.redis.cache.user.captcha_fail}:${member.user.id}`)) >=
      50 &&
    !(await isEcoBanned(member.user.id))
  ) {
    await setEcoBan(member.user.id, dayjs().add(1, "day").toDate());
    await hook.send(
      `[${getTimestamp()}] **${member.user.username}** (${
        member.user.id
      }) has been banned for 24 hours for failing 50 captchas`,
    );
    await requestDM({
      client: member.client as NypsiClient,
      content:
        "you have been banned from nypsi economy for 24 hours for failing/ignoring too many captchas",
      memberId: member.user.id,
    });
  }

  await hook.send(
    `[${getTimestamp()}] **${member.user.username}** (${
      member.user.id
    }) has failed/ignored a captcha (${content}) [${parseInt(
      await redis.get(`${Constants.redis.cache.user.captcha_fail}:${member.user.id}`),
    )}]${
      parseInt(await redis.get(`${Constants.redis.cache.user.captcha_fail}:${member.user.id}`)) %
        15 ===
        0 && !(await isEcoBanned(member.user.id))
        ? " <@&1091314758986256424>"
        : ""
    }`,
  );
  hook.destroy();
}

export async function verifyUser(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
) {
  const res = await isLockedOut(message.author.id);

  if (!res) return;

  if (res.type === 1) {
    if (beingVerified.has(message.author.id)) return;

    const { captcha, text } = await createCaptcha();

    const embed = new CustomEmbed(message.member).setTitle("you have been locked");

    embed.setDescription(
      "please note that using macros / auto typers is not allowed with nypsi" +
        "\n**if you fail too many captchas you may be banned**" +
        "\n\nplease type the following:",
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
        failedCaptcha(message.member, "captcha timed out");
        message.channel.send({
          content:
            message.author.toString() +
            " captcha failed, please **type** the letter/number combination shown",
        });
      });

    beingVerified.delete(message.author.id);

    if (fail) return;
    if (!response) return;

    if (response.content.toLowerCase() == text) {
      logger.info(`captcha (${message.author.id}) passed`);
      passedCaptcha(message.member);
      await redis.del(`${Constants.redis.nypsi.LOCKED_OUT}:${message.author.id}`);
      response.react("✅");
    } else {
      logger.info(`${message.guild} - ${message.author.username}: ${message.content}`);
      logger.info(`captcha (${message.author.id}) failed`);
      failedCaptcha(message.member, response.content);
      message.channel.send({
        content:
          message.author.toString() +
          " captcha failed, please **type** the letter/number combination shown",
      });
    }
  } else if (res.type === 2) {
    const embed = new CustomEmbed(message.member).setTitle("you have been locked");

    embed.setDescription(
      "please note that using macros / auto typers is not allowed with nypsi" +
        "\n**if you fail or ignore too many captchas you may be banned**" +
        `\n\n[you must complete a captcha by clicking here](https://nypsi.xyz/captcha?id=${res.id})`,
    );
    embed.setColor(Constants.EMBED_FAIL_COLOR);

    const msg =
      message instanceof Message
        ? await message.reply({ embeds: [embed] })
        : await message.reply({ embeds: [embed], ephemeral: true }).then((r) => r.fetch());

    const query = await prisma.captcha.update({
      where: { id: res.id },
      data: { received: { increment: 1 } },
    });

    if (query.solved) {
      await msg.edit({
        embeds: [
          new CustomEmbed().setColor(Constants.EMBED_SUCCESS_COLOR).setDescription("✅ verified"),
        ],
      });
      await redis.del(`${Constants.redis.nypsi.LOCKED_OUT}:${message.author.id}`);
      passedCaptcha(
        message.member,
        "```" +
          `received: ${query.received}\n` +
          `visits (${query.visits.length}): ${query.visits.map((i) => `<t:${Math.floor(i.getTime() / 1000)}:R>`)}` +
          "```",
      );

      return true;
    } else if (query.received > 1) {
      failedCaptcha(message.member, "null");
      return false;
    }
  }

  return false;
}
