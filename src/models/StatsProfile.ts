type StatsData = {
  economyUserId: string;
  type: string;
  win: number | bigint;
  lose: number | bigint;
  gamble: boolean;
};

export class StatsProfile {
  public gamble: { [key: string]: { wins: number; lose: number } };
  public items: { [key: string]: number };
  public rob: { wins: number; lose: number };
  constructor(data: StatsData[]) {
    this.gamble = {};
    this.items = {};
    this.rob = {
      wins: 0,
      lose: 0,
    };

    if (data) {
      this.setData(data);
    }

    return this;
  }

  setData(data: StatsData[]) {
    for (const d of data) {
      if (d.gamble) {
        this.gamble[d.type] = {
          wins: 0,
          lose: 0,
        };
        this.gamble[d.type].wins = Number(d.win);
        this.gamble[d.type].lose = Number(d.lose);
      } else {
        if (d.type == "rob") {
          this.rob.wins = Number(d.win);
          this.rob.lose = Number(d.lose);
        } else {
          this.items[d.type] = Number(d.win);
        }
      }
    }
  }
}
