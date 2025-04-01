async function loadCardData() {
  try {
    const response = await fetch('transcript.yml');
    const yamlText = await response.text();
    const data = jsyaml.load(yamlText);
    console.log('Loaded cards:', data.cards);
    return data.cards;
  } catch (error) {
    console.error('Error loading card data:', error);
    return null;
  }
}

function createCardElement(key, card) {
  const cardDiv = document.createElement('div');
  cardDiv.className = 'card';
  
  const number = document.createElement('div');
  number.className = 'card-number';
  number.textContent = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  const title = document.createElement('h3');
  title.className = 'card-title';
  title.textContent = card.name;
  
  const content = document.createElement('div');
  content.className = 'card-content';
  content.textContent = card.requirements;
  
  if (card.flavor) {
    const flavor = document.createElement('div');
    flavor.className = 'card-flavor';
    flavor.textContent = Array.isArray(card.flavor) ? card.flavor.join(' ') : card.flavor;
    content.appendChild(flavor);
  }
  
  cardDiv.appendChild(number);
  cardDiv.appendChild(title);
  cardDiv.appendChild(content);
  
  return cardDiv;
}

function createCardsContainer() {
  const container = document.createElement('div');
  container.className = 'cards-container';
  return container;
}

// Initialize when the DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  const cards = await loadCardData();
  if (cards && typeof cards === 'object') {
    // Create container for cards
    const container = createCardsContainer();
    
    // Create and append each card
    Object.entries(cards).forEach(([key, card]) => {
      const cardElement = createCardElement(key, card);
      container.appendChild(cardElement);
    });
    
    // Find the Arcana section and append the cards container
    const arcanaSection = document.getElementById('arcana');
    arcanaSection.appendChild(container);
  } else {
    console.error('Invalid cards data:', cards);
  }
}); 