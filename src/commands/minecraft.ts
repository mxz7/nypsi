import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message } from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders.js";

const cmd = new Command("minecraft", "view information about a minecraft account", Categories.MINECRAFT).setAliases(["mc"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      if (message.deferred) {
        await message.editReply(data);
      } else {
        await message.reply(data as InteractionReplyOptions);
      }
      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as BaseMessageOptions);
    }
  };

  return send({
    embeds: [
      new CustomEmbed(
        message.member,
        "sadly, minecraft has removed access to the name history api, meaning it is now impossible for nypsi to retreive name history data.\n\nhttps://help.minecraft.net/hc/en-us/articles/8969841895693-Username-History-API-Removal-FAQ-"
      ),
    ],
  });
}

cmd.setRun(run);

module.exports = cmd;
