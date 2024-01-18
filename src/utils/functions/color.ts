import { flavors } from "@catppuccin/palette";
import { ColorResolvable, GuildMember } from "discord.js";

const colors: string[] = [
  flavors.mocha.colors.flamingo.hex,
  flavors.mocha.colors.mauve.hex,
  flavors.mocha.colors.maroon.hex,
  flavors.mocha.colors.peach.hex,
  flavors.mocha.colors.yellow.hex,
  flavors.mocha.colors.green.hex,
  flavors.mocha.colors.sky.hex,
  flavors.mocha.colors.lavender.hex,
];

export function getColor(member: GuildMember) {
  if (member.displayHexColor == "#ffffff" || member.displayHexColor == "#000000") {
    return colors[Math.floor(Math.random() * colors.length)] as ColorResolvable;
  } else {
    return member.displayHexColor;
  }
}
