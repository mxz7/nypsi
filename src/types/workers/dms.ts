import { APIActionRowComponent, APIComponentInActionRow, APIEmbed } from "discord-api-types/v10";

export interface DMJobData {
  memberId: string;
  payload: {
    content?: string;
    embeds?: APIEmbed[];
    components?: APIActionRowComponent<APIComponentInActionRow>[];
  };
}
