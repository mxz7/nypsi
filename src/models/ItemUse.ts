import { CommandInteraction, Message } from "discord.js";
import { NypsiCommandInteraction } from "./Command";

export class ItemUse {
  public itemId: string;
  public run: (message: Message | (NypsiCommandInteraction & CommandInteraction), args?: string[]) => void;

  constructor(
    itemId: string,
    func: (message: Message | (NypsiCommandInteraction & CommandInteraction), args?: string[]) => void
  ) {
    this.itemId = itemId;
    this.run = func;
  }
}
