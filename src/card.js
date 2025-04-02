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

// function to initialize a user with an empty hand
function initializeUser(userId) {
  if (!userCards[userId]) {
    userCards[userId] = [];
  }
}

// Function to initiate a trade
function initiateTrade(user1Id, card1, user2Id, card2, channelName, sendMessage) {
  if (channelName !== designatedChannel) {
    return `Error: Trades are only allowed in the designated channel: ${designatedChannel}.`;
  }

  initializeUser(user1Id);
  initializeUser(user2Id);

  if (!userCards[user1Id].includes(card1)) {
    return `Error: ${user1Id} does not own the card "${card1}".`;
  }

  if (!userCards[user2Id].includes(card2)) {
    return `Error: ${user2Id} does not own the card "${card2}".`;
  }

  pendingTrades[user2Id] = { from: user1Id, card1, card2 };

  sendMessage(user2Id, {
    text: `${user1Id} wants to trade "${card1}" for your "${card2}".`,
    attachments: [
      {
        text: "Do you accept this trade?",
        fallback: "You cannot respond to this trade.",
        callback_id: "trade_action",
        actions: [
          {
            name: "accept",
            text: "Accept",
            type: "button",
            value: "accept",
          },
          {
            name: "reject",
            text: "Reject",
            type: "button",
            value: "reject",
          },
        ],
      },
    ],
  });

  return `Trade request sent to ${user2Id}.`;
}

// Function to handle trade acceptance
function acceptTrade(user2Id) {
  const trade = pendingTrades[user2Id];
  if (!trade) {
    return `Error: No pending trade request for ${user2Id}.`;
  }

  const { from: user1Id, card1, card2 } = trade;

  userCards[user1Id] = userCards[user1Id].filter((card) => card !== card1);
  userCards[user2Id] = userCards[user2Id].filter((card) => card !== card2);

  userCards[user1Id].push(card2);
  userCards[user2Id].push(card1);

  delete pendingTrades[user2Id];

  return `Trade successful! ${user1Id} traded "${card1}" with ${user2Id} for "${card2}".`;
}

// function to handle trade rejection
function rejectTrade(user2Id) {
  const trade = pendingTrades[user2Id];
  if (!trade) {
    return `Error: No pending trade request for ${user2Id}.`;
  }

  delete pendingTrades[user2Id];

  return `Trade request rejected by ${user2Id}.`;
}

module.exports = { cards, userCards, initiateTrade, acceptTrade, rejectTrade };