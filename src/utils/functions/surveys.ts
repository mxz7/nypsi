import { GuildMember } from "discord.js";
import prisma from "../../init/database";

export async function getSurveys(member: GuildMember) {
  const query = await prisma.survey.findMany({
    where: {
      ownerId: member.user.id,
    },
  });

  return query;
}

export async function createSurvey(ownerId: string, text: string, resultsAt: Date, messageId: string, channelId: string) {
  return await prisma.survey.create({
    data: {
      ownerId: ownerId,
      surveyText: text,
      resultsAt: resultsAt,
      messageId: messageId,
      channelId: channelId,
    },
  });
}

export async function getSurveyByMessageId(id: string) {
  return await prisma.survey.findUnique({
    where: {
      messageId: id,
    },
    include: {
      SurveyData: true,
    },
  });
}
