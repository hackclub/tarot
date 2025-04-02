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


function drawCard(channelName) {
  if (channelName !== "#draw-tarot") {
    console.log("Only available in #draw-tarot.");
    return;
  }

  const randomIndex = Math.floor(Math.random() * cards.length);
  const drawnCard = cards[randomIndex];
  console.log(`You drew: ${drawnCard}`);
}
module.exports = { drawCard };