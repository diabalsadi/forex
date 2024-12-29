import express = require("express");
// const socketIO = require("socket.io");

import { Wallet } from "./models/wallet";
import { Ticker } from "./models/ticker";

const port = process.env.PORT || 3000;
const app = express();

const wallet = new Wallet();

const server = app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});

// var wss = socketIO(server);

// wss.on("connection", (socket) => {
//   socket.send({ message: "Welcome to the WebSocket server!" });

//   socket.on("message", (message: string) => {
//     console.log(`Received from client: ${message}`);
//   });

//   socket.on("close", () => {
//     console.log("A client disconnected");
//   });
// });

// This should be a POST request, but for simplicity, we are using a GET request and attached based on JWT
app.get("/add-ticker", async (req, res) => {
  try {
    const { symbol } = req.query;

    if (!symbol || typeof symbol !== "string") {
      return res
        .status(400)
        .json({ message: "Symbol is required and must be a string." });
    }

    if (wallet.getTicker(symbol)) {
      return res
        .status(400)
        .json({ message: "Ticker already exists in the wallet." });
    }

    const tickerSymbol = symbol.toUpperCase();
    wallet.addTicker(new Ticker(tickerSymbol));

    res.status(200).json({ message: `${tickerSymbol} added to the wallet` });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: error.message || "An unexpected error occurred." });
  }
});

app.get("/get/:symbol", async (req, res) => {
  const { symbol } = req.params;
  const ticker = wallet.getTicker(symbol);

  if (!ticker) {
    return res.status(404).json({ message: "Ticker not found" });
  }

  return res.status(200).json(ticker.getAllData());
});
