import { variants } from "@catppuccin/palette";
import { ColorResolvable, GuildMember } from "discord.js";

export function getColor(member: GuildMember) {
  if (member.displayHexColor == "#ffffff") {
    return variants.latte.base.hex as ColorResolvable;
  } else {
    return member.displayHexColor;
  }
}
