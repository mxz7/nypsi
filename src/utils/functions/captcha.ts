import { CaptchaGenerator } from "captcha-canvas";
import * as crypto from "node:crypto";

const locked: string[] = [];

const colors = ["deeppink", "green", "red", "blue"];

const generator = new CaptchaGenerator().setDecoy({ opacity: 0.5, total: 5 });

export function isLockedOut(string: string): boolean {
  if (locked.indexOf(string) == -1) {
    return false;
  } else {
    return true;
  }
}

export function toggleLock(string: string) {
  if (isLockedOut(string)) {
    locked.splice(locked.indexOf(string), 1);
  } else {
    locked.push(string);
  }
}

export async function createCaptcha() {
  let text = crypto.randomBytes(32).toString("hex");

  text = text.substring(0, Math.floor(Math.random() * 3) + 6);

  generator.setCaptcha({ colors, text });
  return { captcha: await generator.generate(), text };
}
