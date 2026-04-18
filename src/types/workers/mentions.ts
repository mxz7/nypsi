import { PermissionOverwrites } from "discord.js";

export type Mention = "everyone" | `role:${string}` | `user:${string}`;

export interface MentionJobData {
  messageId: string;
  messageUrl: string;
  guildId: string;
  channelId: string;
  channelOverwrites: PermissionOverwrites[] | null;
  roles: { id: string; permissions: string }[];
  content: string;
  mentions: Mention[];
  username: string; //  user that tagged
  date: number;
}
