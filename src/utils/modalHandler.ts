import { ModalSubmitInteraction } from "discord.js";

type ModalCollector = (interaction: ModalSubmitInteraction) => Promise<any>;

const modalCollectors = new Map<string, ModalCollector>();

export function createModalId(
  baseId: string,
  userId: string,
  interactionId: string,
  messageId: string,
): `${string}:${string}:${string}:${string}` {
  return `${baseId}:${userId}:${interactionId}:${messageId}`;
}

export function registerModalCollector(id: string, fn: ModalCollector) {
  modalCollectors.set(id, fn);
}

export function deleteModalCollectors(messageId: string): void;
export function deleteModalCollectors(baseId: string, userId: string): void;
export function deleteModalCollectors(baseId: string, userId?: string) {
  for (const [key] of modalCollectors) {
    if ((userId && key.startsWith(`${baseId}:${userId}`)) || (!userId && key.endsWith(baseId))) {
      modalCollectors.delete(key);
    }
  }
}

export function consumeModalCollector(id: string) {
  const fn = modalCollectors.get(id);
  modalCollectors.delete(id);
  return fn;
}
