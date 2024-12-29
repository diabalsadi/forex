const cron = require("node-cron");

enum TimeTickerMap {
  "XAU" = "*/1 * * * *",
  "XAG" = "*/2 * * * *",
}

// Investing.com routing
enum TickerValue {
  "XAU" = 68,
}

export class Ticker {
  private symbol: string;
  price: number;
  previousPrice: number = 0;
  date: Date;
  score: "BUY" | "SELL" | "NEUTRAL" = "NEUTRAL";
  currency: string;
  endPoint: string;
  lowPriceOfTheDay: number;
  highPriceOfTheDay: number;
  private priceHistory: { price: number; timestamp: Date }[] = [];
  private scoreHistory: { score: string; timestamp: Date }[] = [];
  private supportLevels: number[] = [];
  private resistanceLevels: number[] = [];
  private trendDirection: "UP" | "DOWN" | "NEUTRAL" = "NEUTRAL"; // Track trend direction

  constructor(symbol: string, currency: string = "USD") {
    this.symbol = symbol;
    this.currency = currency;
    this.endPoint = `https://data-asg.goldprice.org/GetData/${this.currency}-${symbol}/1`;
    this.lowPriceOfTheDay = Infinity;
    this.highPriceOfTheDay = -Infinity;

    this.addHistory();

    cron.schedule(TimeTickerMap[this.symbol], this.scrapePrice.bind(this));
    cron.schedule("0 0 2 * * *", this.addHistory.bind(this));
  }

  async fetchPrice() {
    try {
      const response = await fetch(this.endPoint);

      if (!response.ok) {
        throw new Error(`Request failed with status: ${response.status}`);
      }

      const data = await response.json();
      if (!data || !data[0]) {
        throw new Error("Invalid or empty response data");
      }

      this.date = new Date();
      this.previousPrice = this.price;
      this.price = parseFloat(data?.[0]?.split(",")[1] ?? "0");

      this.updatePriceOfTheDay();
      this.storePriceData();
      this.storeScore();
      this.detectBOS();
      this.detectCOC();
    } catch (error) {
      console.error("Error fetching price:", error.message);
    }
  }

  // Updates the low and high price of the day
  updatePriceOfTheDay() {
    const currentDay = this.date.getDate();
    const lastPriceDate = new Date(this.date);

    // Check if the day has changed
    if (this.date.getDate() !== currentDay) {
      this.lowPriceOfTheDay = Infinity;
      this.highPriceOfTheDay = -Infinity;
    }

    // Update the high and low prices based on the current price
    if (this.price < this.lowPriceOfTheDay) {
      this.lowPriceOfTheDay = this.price;
    }
    if (this.price > this.highPriceOfTheDay) {
      this.highPriceOfTheDay = this.price;
    }
  }

  storePriceData() {
    this.priceHistory.push({ price: this.price, timestamp: this.date });
    if (this.priceHistory.length > 100) {
      this.priceHistory.shift();
    }
    this.updateSupportResistanceLevels();
  }

  storeScore() {
    const score = this.calculateScore();
    this.scoreHistory.push({ score, timestamp: this.date });
    if (this.scoreHistory.length > 100) {
      this.scoreHistory.shift();
    }
  }

  getPriceHistory(count: number) {
    return this.priceHistory.slice(-count).map((entry) => entry.price);
  }

  calculateScore() {
    const priceChange = this.price - this.previousPrice;
    const volatility = this.calculateVolatility();
    const trendStrength = this.calculateTrendStrength();

    // Additional condition based on support and resistance levels
    const isNearSupport = this.supportLevels.some(
      (level) => this.price <= level * 1.01
    ); // 1% above support
    const isNearResistance = this.resistanceLevels.some(
      (level) => this.price >= level * 0.99
    ); // 1% below resistance

    if (
      priceChange > 0 &&
      volatility < 0.02 &&
      trendStrength > 0.5 &&
      !isNearResistance
    ) {
      return "BUY";
    } else if (
      priceChange < 0 &&
      volatility < 0.02 &&
      trendStrength < -0.5 &&
      !isNearSupport
    ) {
      return "SELL";
    } else {
      return "NEUTRAL";
    }
  }

  calculateVolatility() {
    const priceHistory = this.getPriceHistory(10);
    const mean =
      priceHistory.reduce((acc, price) => acc + price, 0) / priceHistory.length;
    const variance =
      priceHistory.reduce((acc, price) => acc + Math.pow(price - mean, 2), 0) /
      priceHistory.length;
    return Math.sqrt(variance);
  }

  calculateTrendStrength() {
    const prices = this.getPriceHistory(10);
    const sma = prices.reduce((acc, price) => acc + price, 0) / prices.length;
    const trendStrength = this.price - sma;

    // Adjust the trend strength based on how close the price is to support/resistance
    if (this.price <= Math.min(...this.supportLevels)) {
      return trendStrength * 1.2; // Amplify trend if near support
    } else if (this.price >= Math.max(...this.resistanceLevels)) {
      return trendStrength * -1.2; // Reverse trend if near resistance
    }

    return trendStrength;
  }

  updateSupportResistanceLevels() {
    // Use the entire price history for more accurate support/resistance levels
    const allPrices = this.priceHistory.map((entry) => entry.price);

    // Find the minimum and maximum prices from all historical data
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);

    // Update support and resistance levels
    if (this.price === minPrice && !this.supportLevels.includes(this.price)) {
      this.supportLevels.push(this.price);
    }
    if (
      this.price === maxPrice &&
      !this.resistanceLevels.includes(this.price)
    ) {
      this.resistanceLevels.push(this.price);
    }
  }

  detectBOS() {
    // Detect Break of Structure (BOS)
    const recentHigh = Math.max(...this.getPriceHistory(10));
    const recentLow = Math.min(...this.getPriceHistory(10));

    if (this.price > recentHigh) {
      console.log("Bullish BOS detected!");
      this.trendDirection = "UP"; // Bullish trend
    } else if (this.price < recentLow) {
      console.log("Bearish BOS detected!");
      this.trendDirection = "DOWN"; // Bearish trend
    }
  }

  detectCOC() {
    // Detect Change of Character (COC)
    if (this.trendDirection === "UP" && this.price < this.previousPrice) {
      console.log("COC: Trend might be reversing to bearish.");
      this.trendDirection = "NEUTRAL"; // Potential trend reversal to neutral or bearish
    } else if (
      this.trendDirection === "DOWN" &&
      this.price > this.previousPrice
    ) {
      console.log("COC: Trend might be reversing to bullish.");
      this.trendDirection = "NEUTRAL"; // Potential trend reversal to neutral or bullish
    }
  }

  async scrapePrice() {
    await this.fetchPrice();
    const score = this.calculateScore();
    console.log(`Score for ${this.symbol}: ${score}`);
    console.log(`Current Trend: ${this.trendDirection}`);
    console.log(`Support Levels: ${this.supportLevels}`);
    console.log(`Resistance Levels: ${this.resistanceLevels}`);
  }

  getSymbol() {
    return this.symbol;
  }

  getAllData() {
    return {
      symbol: this.symbol,
      price: this.price,
      previousPrice: this.previousPrice,
      date: this.date,
      score: this.score,
      currency: this.currency,
      priceHistory: this.priceHistory,
      scoreHistory: this.scoreHistory,
      supportLevels: this.supportLevels,
      resistanceLevels: this.resistanceLevels,
      trendDirection: this.trendDirection,
      lowPriceOfTheDay: this.lowPriceOfTheDay,
      highPriceOfTheDay: this.highPriceOfTheDay,
    };
  }

  addHistory() {
    const endpoint = `https://api.investing.com/api/financialdata/${
      TickerValue[this.symbol]
    }/historical/chart/?interval=P1D&pointscount=160`;

    console.log({ endpoint });

    fetch(endpoint, {
      method: "GET",
    })
      .then((response) => {
        console.log("Response Status:", response.status);
        console.log("Response Status Text:", response.statusText);
        return response.text();
      })
      .then((text) => {
        console.log("Response Text:", text);
        try {
          const rs = JSON.parse(text);
          const data = rs.data;
          if (Array.isArray(data)) {
            // Process the historical data
            data.forEach((entry) => {
              const timestamp = entry[0];
              const closePrice = entry[4];
              const date = new Date(timestamp);

              this.priceHistory.push({ price: closePrice, timestamp: date });

              this.updateSupportResistanceLevels();

              if (this.priceHistory.length > 100) {
                this.priceHistory.shift();
              }
            });
          } else {
            console.error("No valid historical data available.");
          }
        } catch (error) {
          console.error("Error parsing response:", error.message);
        }
      })
      .catch((error) => {
        console.error("Error fetching historical data:", error.message);
      });
  }
}
