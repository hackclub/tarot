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
  cardDiv.appendChild(number);

  if (card.image) {
    // Create and append image for image-based cards
    const img = document.createElement('img');
    img.src = `cards/${card.image}`;
    img.alt = card.name;
    img.className = 'card-image';
    cardDiv.appendChild(img);
  } else {
    // Create text-based card content with scramble effect
    const title = document.createElement('h3');
    title.className = 'card-title scrambled';
    title.setAttribute('data-text', card.name);
    title.textContent = card.name;
    
    const content = document.createElement('div');
    content.className = 'card-content scrambled';
    content.setAttribute('data-text', card.requirements);
    content.textContent = card.requirements;
    
    if (card.flavor) {
      const flavor = document.createElement('div');
      flavor.className = 'card-flavor scrambled';
      const flavorText = Array.isArray(card.flavor) ? card.flavor.join(' ') : card.flavor;
      flavor.setAttribute('data-text', flavorText);
      flavor.textContent = flavorText;
      content.appendChild(flavor);
    }
    
    cardDiv.appendChild(title);
    cardDiv.appendChild(content);
  }

  // Add click handler to open modal
  cardDiv.addEventListener('click', () => {
    openModal(card);
  });
  
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

    // Initialize scramble effect after cards are added
    initScrambledText();
  } else {
    console.error('Invalid cards data:', cards);
  }
}); 