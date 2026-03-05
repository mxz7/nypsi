import { ActionRowBuilder, MessageActionRowComponentBuilder } from "discord.js";
import { CustomEmbed } from "../models/EmbedBuilders";

export interface NotificationPayload {
  memberId: string;
  payload: {
    embed?: CustomEmbed;
    components?: ActionRowBuilder<MessageActionRowComponentBuilder>;
    content?: string;
  };
}

export interface InlineNotificationPayload {
  memberId: string;
  embed: CustomEmbed;
}

export interface NotificationData {
  id: string;
  name: string;
  description: string;
  types?: { name: string; description: string; value: string }[];
}
