import { Message, TextChannel, User } from "discord.js";
import { CustomEmbed } from "../models/EmbedBuilders";
import { Car } from "../utils/functions/economy/cars";
import { Item } from "./Economy";

export interface RaceDetails {
  channel: TextChannel;
  users: RaceUserDetails[];
  bet: number;
  message: Message;
  embed: CustomEmbed;
  started: boolean;
  speedLimit: number;
  length: number;
}

export interface RaceUserDetails {
  user: User;
  car: RaceUserCar | RaceUserItem;
  position: number;
}

type RaceUserCar = {
  type: "car";
  car: Car;
};

type RaceUserItem = {
  type: "item";
  car: Item;
};
