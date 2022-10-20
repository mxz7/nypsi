import { CaptchaGenerator } from "captcha-canvas";
import { GuildMember, WebhookClient } from "discord.js";
import * as crypto from "node:crypto";
import redis from "../../init/redis";
import { getTimestamp } from "../logger";
import ms = require("ms");
import Constants from "../Constants";

const locked: string[] = [];

const colors = ["deeppink", "green", "red", "blue"];

const generator = new CaptchaGenerator().setDecoy({ opacity: 0.6, total: 15 });

const captchaFails = new Map<string, number>();
const captchaPasses = new Map<string, number>();

export function isLockedOut(string: string): boolean {
  if (locked.indexOf(string) == -1) {
    return false;
  } else {
    return true;
  }
}

export async function toggleLock(string: string) {
  if (isLockedOut(string)) {
    locked.splice(locked.indexOf(string), 1);
  } else {
    if (await isVerified(string)) return;
    locked.push(string);
  }
}

export async function createCaptcha() {
  let text = crypto.randomBytes(32).toString("hex");

  text = text.substring(0, Math.floor(Math.random() * 3) + 6);

  generator.setCaptcha({ colors, text });
  return { captcha: await generator.generate(), text };
}

export async function isVerified(id: string) {
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
  await redis.expire(`${Constants.redis.nypsi.CAPTCHA_VERIFIED}:${member.user.id}`, ms("1 hour") / 1000);
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
