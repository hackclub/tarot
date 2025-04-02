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

const userCards = {
  alice: ["The Fool", "The Magician"],
  bob: ["The High Priestess", "The Empress"],
};

function drawCard(channelName) {
  if (channelName !== designatedChannel) {
    return `Error: Drawing cards is only allowed in the designated channel: ${designatedChannel}.`;
  }

  const randomIndex = Math.floor(Math.random() * cards.length);
  return cards[randomIndex];
}

function viewHand(user, channelName) {
  if (channelName !== designatedChannel) {
    return `Error: Viewing hands is only allowed in the designated channel: ${designatedChannel}.`;
  }

  if (!userCards[user]) {
    return `Error: User "${user}" does not exist.`;
  }

  return `${user}'s hand: ${userCards[user].join(", ")}`
function tradeCards(user1, card1, user2, card2, channelName) {
  if (channelName !== designatedChannel) {
    return `Error: Trades are only allowed in the designated channel: ${designatedChannel}.`;
  }

  if (!userCards[user1] || !userCards[user2]) {
    return `Error: One or both users do not exist.`;
  }

  if (!userCards[user1].includes(card1)) {
    return `Error: ${user1} does not own the card "${card1}".`;
  }
  if (!userCards[user2].includes(card2)) {
    return `Error: ${user2} does not own the card "${card2}".`;
  }

  userCards[user1] = userCards[user1].filter((card) => card !== card1);
  userCards[user2] = userCards[user2].filter((card) => card !== card2);

  userCards[user1].push(card2);
  userCards[user2].push(card1);

  return `Trade successful! ${user1} traded "${card1}" with ${user2} for "${card2}".`;
}

module.exports = { cards, userCards, drawCard, viewHand, tradeCards };