const cards = [
  "The Fool",
  "The Magician",
  "The High Priestess",
  "The Empress",
  "The Emperor",
  "The Hierophant",
  "The Lovers",
  "The Chariot",
  "Strength",
  "The Hermit",
  "Wheel of Fortune",
  "Justice",
  "The Hanged Man",
  "Death",
  "Temperance",
  "The Cryptid",
  "The Monolith",
  "The Star",
  "The Moon",
  "The Sun",
  "Judgement",
  "The World",
];

const designatedChannel = "#draw-tarot";
const userCards = {};
const pendingTrades = {};
const tradeHistory = {};
const tradeExpirationTime = 60000;

function createError(message) {
  return { success: false, error: message };
}

function createSuccess(message) {
  return { success: true, message };
}

function logAction(action, details) {
  console.log(`[${new Date().toISOString()}] ${action}:`, details);
}

function notifyUser(userId, message) {
  console.log(`Notification to ${userId}: ${message}`);
}

function validateInputs(user1Id, card1, user2Id, card2) {
  if (typeof user1Id !== "string" || typeof user2Id !== "string") {
    throw new Error("User IDs must be strings.");
  }
  if (!cards.includes(card1) || !cards.includes(card2)) {
    throw new Error("Invalid card name.");
  }
}

function getPendingTrade(user2Id) {
  const trade = pendingTrades[user2Id];
  if (!trade) {
    throw new Error(`No pending trade request for ${user2Id}.`);
  }
  return trade;
}

function initializeUser(userId) {
  if (!userCards[userId]) {
    userCards[userId] = [];
  }
}

function logTrade(user1Id, card1, user2Id, card2, status) {
  if (!tradeHistory[user1Id]) tradeHistory[user1Id] = [];
  if (!tradeHistory[user2Id]) tradeHistory[user2Id] = [];

  const tradeRecord = { with: user2Id, card1, card2, status, timestamp: new Date() };

  tradeHistory[user1Id].push(tradeRecord);
  tradeHistory[user2Id].push({ ...tradeRecord, with: user1Id });
}

function initiateTrade(user1Id, card1, user2Id, card2, channelName, sendMessage) {
  try {
    validateInputs(user1Id, card1, user2Id, card2);

    if (channelName !== designatedChannel) {
      return createError(`Trades are only allowed in the designated channel: ${designatedChannel}.`);
    }

    initializeUser(user1Id);
    initializeUser(user2Id);

    if (!userCards[user1Id].includes(card1)) {
      return createError(`${user1Id} does not own the card "${card1}".`);
    }

    if (!userCards[user2Id].includes(card2)) {
      return createError(`${user2Id} does not own the card "${card2}".`);
    }

    const trade = { from: user1Id, card1, card2, timestamp: Date.now() };
    pendingTrades[user2Id] = trade;

    setTimeout(() => {
      if (pendingTrades[user2Id] === trade) {
        delete pendingTrades[user2Id];
        notifyUser(user1Id, `Your trade request to ${user2Id} has expired.`);
        notifyUser(user2Id, `The trade request from ${user1Id} has expired.`);
        logAction("Trade Expired", { from: user1Id, to: user2Id, card1, card2 });
      }
    }, tradeExpirationTime);

    sendMessage(user2Id, {
      text: `${user1Id} wants to trade "${card1}" for your "${card2}".`,
      attachments: [
        {
          text: "Do you accept this trade?",
          fallback: "You cannot respond to this trade.",
          callback_id: "trade_action",
          actions: [
            { name: "accept", text: "Accept", type: "button", value: "accept" },
            { name: "reject", text: "Reject", type: "button", value: "reject" },
          ],
        },
      ],
    });

    logAction("Trade Initiated", { from: user1Id, to: user2Id, card1, card2 });
    return createSuccess(`Trade request sent to ${user2Id}.`);
  } catch (error) {
    return createError(error.message);
  }
}

function acceptTrade(user2Id) {
  try {
    const { from: user1Id, card1, card2 } = getPendingTrade(user2Id);

    userCards[user1Id] = userCards[user1Id].filter((card) => card !== card1);
    userCards[user2Id] = userCards[user2Id].filter((card) => card !== card2);

    userCards[user1Id].push(card2);
    userCards[user2Id].push(card1);

    delete pendingTrades[user2Id];

    logTrade(user1Id, card1, user2Id, card2, "accepted");

    notifyUser(user1Id, `Your trade with ${user2Id} was accepted.`);
    notifyUser(user2Id, `You accepted the trade with ${user1Id}.`);

    return createSuccess(`Trade successful! ${user1Id} traded "${card1}" with ${user2Id} for "${card2}".`);
  } catch (error) {
    return createError(error.message);
  }
}

function rejectTrade(user2Id) {
  try {
    const { from: user1Id, card1, card2 } = getPendingTrade(user2Id);

    delete pendingTrades[user2Id];

    logTrade(user1Id, card1, user2Id, card2, "rejected");

    notifyUser(user1Id, `Your trade with ${user2Id} was rejected.`);
    notifyUser(user2Id, `You rejected the trade with ${user1Id}.`);

    return createSuccess(`Trade request rejected by ${user2Id}.`);
  } catch (error) {
    return createError(error.message);
  }
}

card.cjs = { cards, userCards, initiateTrade, acceptTrade, rejectTrade };
export { cards, userCards, initiateTrade, acceptTrade, rejectTrade };
