import type { CommandInteraction, GuildMember } from "discord.js";
import type { Item } from "../types/Economy";
import type { NypsiCommandInteraction, NypsiMessage, SendMessage } from "./Command";

export interface ItemUseOptions {
  amount?: boolean;
  target?: boolean;
  suggest?: boolean;
}

export interface ItemUseRequest {
  item: Item;
  amount: number;
  all: boolean;
  target?: GuildMember;
  send: SendMessage;
}

export class ItemUse {
  public itemId: string;
  public options: ItemUseOptions;
  public run: (
    message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
    input: ItemUseRequest,
  ) => unknown;

  constructor(itemId: string, func: ItemUse["run"], options: ItemUseOptions = {}) {
    this.itemId = itemId;
    this.run = func;
    this.options = options;
  }
}
