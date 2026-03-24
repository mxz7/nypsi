import {
  Message,
  MessageCollectorOptionsParams,
  MessageComponentType,
  ModalSubmitInteraction,
} from "discord.js";
import { MessageComponentCollector } from "../types/InteractionHandler";

const modalCollectors = new Map<string, MessageComponentCollector>();

export function createMessageComponentAndModalCollector(
  msg: Message,
  userId: string,
  options: MessageCollectorOptionsParams<MessageComponentType, boolean>,
  ...modalIds: string[]
) {
  const res = msg.createMessageComponentCollector(options) as MessageComponentCollector;
  const id = `${userId}:${msg.id}${modalIds.map((i) => `:${i}`)}`;

  modalCollectors.set(id, res);

  res.on("end", () => {
    modalCollectors.delete(id);
  });

  return res;
}

export function handleModal(interaction: ModalSubmitInteraction) {
  let res: MessageComponentCollector = undefined;

  for (const [key, value] of modalCollectors) {
    if (
      key.startsWith(interaction.user.id) &&
      key.split(":").indexOf(interaction.customId.split(":")[0]) != -1
    ) {
      res = value;
      break;
    }
  }

  if (!res) return;

  res.emit("collect", interaction);
}
