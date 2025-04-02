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

// Function to draw a card
function drawCard(channelName) {
  if (!channelName) {
    return "Error: No channel specified.";
  }

  if (channelName !== designatedChannel) {
    return `This command is only allowed in the designated channel: ${designatedChannel}.`;
  }

  const randomIndex = Math.floor(Math.random() * cards.length);
  return cards[randomIndex];
}

module.exports = { drawCard };