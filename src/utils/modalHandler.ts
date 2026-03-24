import { ModalSubmitInteraction } from "discord.js";

type ModalCollector = (interaction: ModalSubmitInteraction) => Promise<any>;

const modalCollectors = new Map<string, ModalCollector>();

export function registerModalCollector(id: string, fn: ModalCollector) {
  modalCollectors.set(id, fn);
}

export function deleteModalCollectors(baseId: string, userId: string) {
  for (const [key] of modalCollectors) {
    if (key.startsWith(`${baseId}:${userId}`)) {
      modalCollectors.delete(key);
    }
  }
}

export function consumeModalCollector(id: string) {
  const fn = modalCollectors.get(id);
  modalCollectors.delete(id);
  return fn;
}
