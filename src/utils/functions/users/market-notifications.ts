import { CustomEmbed } from "../../../models/EmbedBuilders";
import { NotificationPayload } from "../../../types/Notification";
import { addInlineNotification, addNotificationToQueue } from "./notifications";
import { getPreferences } from "./preferences";

export async function addMarketNotification(data: NotificationPayload): Promise<boolean> {
  const delivery = (await getPreferences(data.memberId)).dms.market;

  if (delivery === "Disabled") return false;

  if (delivery === "DM") {
    await addNotificationToQueue(data);
    return true;
  }

  const embed = data.payload.embed ?? new CustomEmbed(data.memberId, data.payload.content);

  if (data.payload.content && !embed.data.author) {
    embed.setHeader(data.payload.content);
  }

  await addInlineNotification({ memberId: data.memberId, embed });
  return true;
}
