export enum NotificationType {
  ROB = "rob",
  LOTTERY = "lottery",
  PREMIUM = "premium",
  AUCTION = "auction",
  VOTE = "vote",
  VOTE_REMINDER = "vote_reminder",
  WORKER = "worker",
  BOOSTER = "booster",
  PAYMENT = "payment",
}

export const NotificationData = {
  rob: {
    name: "robbery notifications",
    description: "get dm notifications when someone attempts to rob you",
    type: NotificationType.ROB,
  },
  lottery: {
    name: "lottery notifications",
    description: "get dm notifications when you win the lottery",
    type: NotificationType.LOTTERY,
  },
  premium: {
    name: "premium notifications",
    description: "get dm notifications for updates on your premium membership",
    type: NotificationType.PREMIUM,
  },
  auction: {
    name: "auction notifications",
    description: "get dm notifications when someone buys your auctions",
    type: NotificationType.AUCTION,
  },
  vote: {
    name: "vote notificatons",
    description: "get a dm when you vote showing your rewards for voting",
    type: NotificationType.VOTE,
  },
  vote_reminder: {
    name: "vote reminders",
    description: "get a dm notification when you are able to vote again",
    type: NotificationType.VOTE_REMINDER,
  },
  worker: {
    name: "worker notifications",
    description: "get a dm notification when one of your workers has reached full capacity",
    type: NotificationType.WORKER,
  },
  booster: {
    name: "booster notifications",
    description: "get a dm notification when one or more of your boosters have expired",
    type: NotificationType.BOOSTER,
  },
  payment: {
    name: "payment notifications",
    description: "get a dm notification when someone sends you money or gives you an item",
    type: NotificationType.PAYMENT,
  },
};
