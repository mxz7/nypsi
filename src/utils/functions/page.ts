import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
  Message,
  MessageActionRowComponentBuilder,
  MessageFlags,
} from "discord.js";
import { CustomEmbed } from "../../models/EmbedBuilders";

interface PageManagerOptions<T> {
  message: Message;
  row: ActionRowBuilder<MessageActionRowComponentBuilder>;
  arr?: T[];
  pages?: Map<number, T[]>;
  pageLength?: number;
  embed: CustomEmbed;
  updateEmbed?: (page: T[], embed: CustomEmbed) => CustomEmbed;
  userId: string;
  handleResponses?: Map<
    string,
    (manager: PageManager<T>, interaction: ButtonInteraction) => Promise<void>
  >;
  onPageUpdate?: (manager: PageManager<T>) => CustomEmbed;
  allowMessageDupe?: boolean;
}

export default class PageManager<T> {
  static createPages<T>(arr: T[], pageLength = 10): Map<number, T[]> {
    const map = new Map<number, T[]>();

    for (const item of arr) {
      if (map.size == 0) {
        map.set(1, [item]);
      } else {
        if (map.get(map.size).length >= pageLength) {
          map.set(map.size + 1, [item]);
        } else {
          map.get(map.size).push(item);
        }
      }
    }

    return map;
  }

  static defaultRow() {
    return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("⬅")
        .setLabel("back")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
    );
  }

  public pages: Map<number, T[]>;
  public message: Message;
  public row: ActionRowBuilder<MessageActionRowComponentBuilder>;
  public currentPage = 1;
  public lastPage: number;
  public userId: string;
  public embed: CustomEmbed;
  public updatePageFunc: (page: T[], embed: CustomEmbed) => CustomEmbed;

  private filter:
    | ((i: ButtonInteraction) => boolean)
    | ((i: ButtonInteraction) => Promise<boolean>);
  private handleResponses: Map<
    string,
    (manager: PageManager<T>, interaction: ButtonInteraction) => Promise<void>
  >;
  private onPageUpdate: (manager: PageManager<T>) => CustomEmbed;
  private allowMessageDupe: boolean;

  constructor(opts: PageManagerOptions<T>) {
    this.pages = opts.arr ? PageManager.createPages(opts.arr, opts.pageLength) : opts.pages;
    this.lastPage = this.pages.size;
    this.message = opts.message;
    this.row = opts.row;
    this.updatePageFunc = opts.updateEmbed;
    this.userId = opts.userId;
    this.embed = opts.embed;
    this.onPageUpdate = opts.onPageUpdate;
    this.allowMessageDupe = opts.allowMessageDupe || false;

    this.filter = async (i: ButtonInteraction) => {
      if (i.user.id == this.userId) return true;

      /*
      
      broken in recent discord.js update. 
      cant await interactions on ephemeral message

      */

      if (!this.allowMessageDupe) return false;

      // (i as ButtonInteraction).reply({
      //   embeds: [
      //     new CustomEmbed(
      //       null,
      //       "unfortunately, cloning paged messages is unavailable due to a recent discord.js update\n" +
      //         "this may or may not be fixed in the future",
      //     ).setColor(Constants.EMBED_FAIL_COLOR),
      //   ],
      //   flags: MessageFlags.Ephemeral,
      // });

      // return false;

      await (i as ButtonInteraction).reply({
        embeds: [this.embed],
        components: [this.row],
        flags: MessageFlags.Ephemeral,
      });

      const manager = new PageManager({
        embed: this.embed,
        message: await i.fetchReply(),
        row: this.row,
        userId: i.user.id,
        pages: this.pages,
        updateEmbed: this.updatePageFunc,
        onPageUpdate: this.onPageUpdate,
        handleResponses: this.handleResponses,
      });

      manager.currentPage = this.currentPage;

      manager.listen();

      return false;
    };

    this.handleResponses = new Map();

    this.handleResponses.set("⬅", this.back);
    this.handleResponses.set("➡", this.next);

    if (opts.handleResponses) {
      for (const [k, v] of opts.handleResponses.entries()) {
        this.handleResponses.set(k, v);
      }
    }
  }

  async render(manager: PageManager<T>, interaction: ButtonInteraction): Promise<void> {
    if (manager.updatePageFunc) {
      manager.embed = manager.updatePageFunc(manager.pages.get(manager.currentPage), manager.embed);
    } else {
      manager.embed = PageManager.defaultUpdateEmbed(
        manager.pages.get(manager.currentPage),
        manager.embed,
      );
    }

    if (manager.onPageUpdate) {
      manager.embed = manager.onPageUpdate(manager);
    }

    if (manager.currentPage == 1) {
      manager.row.components[0].setDisabled(true);
      manager.row.components[1].setDisabled(false);
    } else if (manager.currentPage == manager.lastPage) {
      manager.row.components[1].setDisabled(true);
      manager.row.components[0].setDisabled(false);
    } else {
      manager.row.components[1].setDisabled(false);
      manager.row.components[0].setDisabled(false);
    }

    await interaction
      .update({ embeds: [manager.embed], components: [manager.row] })
      .catch(() => this.message.edit({ embeds: [manager.embed], components: [manager.row] }));
    return manager.listen();
  }

  private async back(manager: PageManager<T>, interaction: ButtonInteraction): Promise<void> {
    if (manager.currentPage == 1) {
      return manager.listen();
    }

    manager.currentPage--;

    return manager.render(manager, interaction);
  }

  private async next(manager: PageManager<T>, interaction: ButtonInteraction): Promise<void> {
    if (manager.currentPage == manager.lastPage) {
      return manager.listen();
    }

    manager.currentPage++;

    return manager.render(manager, interaction);
  }

  public async listen(): Promise<void> {
    const res = await this.message
      .awaitMessageComponent({
        filter: this.filter,
        time: 90000,
        componentType: ComponentType.Button,
      })
      .catch(() => {});

    if (!res) {
      await this.message.edit({ components: [] }).catch(() => {});
      return;
    }

    if (this.handleResponses.has(res.customId)) {
      return this.handleResponses
        .get(res.customId)(this, res)
        .catch(() => {});
    }
  }

  private static defaultUpdateEmbed(page: any[], embed: CustomEmbed): CustomEmbed {
    embed.setDescription(page.join("\n"));

    return embed;
  }
}
