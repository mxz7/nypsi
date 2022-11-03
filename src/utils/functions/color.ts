import { variants } from "@catppuccin/palette";
import { ColorResolvable, GuildMember } from "discord.js";

const colors: string[] = [
  variants.mocha.flamingo.hex,
  variants.mocha.mauve.hex,
  variants.mocha.maroon.hex,
  variants.mocha.peach.hex,
  variants.mocha.yellow.hex,
  variants.mocha.green.hex,
  variants.mocha.sky.hex,
  variants.mocha.lavender.hex,
];

export function getColor(member: GuildMember) {
  if (member.displayHexColor == "#ffffff" || member.displayHexColor == "#000000") {
    return colors[Math.floor(Math.random() * colors.length)] as ColorResolvable;
  } else {
    return member.displayHexColor;
  }
}
