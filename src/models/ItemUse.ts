import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
} from "discord.js";
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

  static async send(
    message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
    data: BaseMessageOptions | InteractionReplyOptions,
  ): Promise<Message> {
    if (!(message instanceof Message)) {
      let usedNewMessage = false;
      let res;

      if (message.deferred) {
        res = await message.editReply(data as InteractionEditReplyOptions).catch(async () => {
          usedNewMessage = true;
          return await message.channel.send(data as BaseMessageOptions);
        });
      } else {
        res = await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data as InteractionEditReplyOptions).catch(async () => {
            usedNewMessage = true;
            return await message.channel.send(data as BaseMessageOptions);
          });
        });
      }

      if (usedNewMessage && res instanceof Message) return res;

      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as BaseMessageOptions);
    }
  }
}
