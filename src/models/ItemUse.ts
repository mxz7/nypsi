import { CommandInteraction } from "discord.js";
import { NypsiCommandInteraction, NypsiMessage } from "./Command";

export class ItemUse {
  public itemId: string;
  public run: (
    message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
    args?: string[],
  ) => void;

  constructor(
    itemId: string,
    func: (
      message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
      args?: string[],
    ) => void,
  ) {
    this.itemId = itemId;
    this.run = func;
  }
}
