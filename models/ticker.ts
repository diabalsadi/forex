enum TimeTicketMap {
  "XAU" = 60000, // Every 1 minute
  "XAG" = 120000, // Every 2 minutes
}

export class Ticker {
  private symbol: string;
  price: number;
  previousPrice: number = 0;
  date: Date;
  score: "BUY" | "SELL" | "NEUTRAL" = "NEUTRAL";
  currency: string;
  endPoint: string;
  private priceHistory: { price: number; timestamp: Date }[] = [];
  private scoreHistory: { score: string; timestamp: Date }[] = [];
  private supportLevels: number[] = []; // Store support levels for liquidity zones
  private resistanceLevels: number[] = []; // Store resistance levels for liquidity zones
  private trendDirection: "UP" | "DOWN" | "NEUTRAL" = "NEUTRAL"; // Track trend direction

  constructor(symbol: string, currency: string = "USD") {
    this.symbol = symbol;
    this.currency = currency;
    this.endPoint = `https://data-asg.goldprice.org/GetData/${this.currency}-${symbol}/1`;
  }

  async fetchPrice() {
    try {
      const response = await fetch(this.endPoint);

      // Check if the response is successful (status code 200)
      if (!response.ok) {
        throw new Error(`Request failed with status: ${response.status}`);
      }

      const data = await response.json(); // Parse JSON only if the response is OK
      if (!data || !data[0]) {
        throw new Error("Invalid or empty response data");
      }

      this.date = new Date();
      this.previousPrice = this.price;
      this.price = parseFloat(data?.[0]?.split(",")[1] ?? 0);

      this.storePriceData();
      this.storeScore();
      this.detectBOS();
      this.detectCOC();
    } catch (error) {
      console.error("Error fetching price:", error.message);
      // Handle the error appropriately, e.g., retry fetching, default values, etc.
    }
  }

  storePriceData() {
    this.priceHistory.push({ price: this.price, timestamp: this.date });
    if (this.priceHistory.length > 100) {
      this.priceHistory.shift(); // Keep only the latest 100 prices
    }
    this.updateSupportResistanceLevels();
  }

  storeScore() {
    const score = this.calculateScore();
    this.scoreHistory.push({ score, timestamp: this.date });
    if (this.scoreHistory.length > 100) {
      this.scoreHistory.shift(); // Keep only the latest 100 scores
    }
  }

  getPriceHistory(count: number) {
    return this.priceHistory.slice(-count).map((entry) => entry.price);
  }

  calculateScore() {
    const priceChange = this.price - this.previousPrice;
    const volatility = this.calculateVolatility();
    const trendStrength = this.calculateTrendStrength();

    if (priceChange > 0 && volatility < 0.02 && trendStrength > 0.5) {
      return "BUY";
    } else if (priceChange < 0 && volatility < 0.02 && trendStrength < -0.5) {
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
    return trendStrength;
  }

  updateSupportResistanceLevels() {
    const recentPrices = this.getPriceHistory(20); // Use the last 20 prices for identifying zones
    const minPrice = Math.min(...recentPrices);
    const maxPrice = Math.max(...recentPrices);

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

  scrapePrice() {
    setInterval(async () => {
      await this.fetchPrice();
      const score = this.calculateScore();
      console.log(`Score for ${this.symbol}: ${score}`);
      console.log(`Current Trend: ${this.trendDirection}`);
      console.log(`Support Levels: ${this.supportLevels}`);
      console.log(`Resistance Levels: ${this.resistanceLevels}`);
    }, TimeTicketMap[this.symbol]);
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
    };
  }
}
