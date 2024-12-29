import { Ticker } from "./ticker";

export class Wallet {
  private tickers: Ticker[];

  constructor() {
    this.tickers = [];
  }

  addTicker(ticker: Ticker) {
    ticker.scrapePrice();
    this.tickers.push(ticker);
  }

  getTickers() {
    return this.tickers;
  }

  getTicker(symbol: string) {
    return this.tickers.find((t) => t.getSymbol() === symbol);
  }
}
