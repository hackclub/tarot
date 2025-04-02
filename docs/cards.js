async function fetchUserData() {
  try {
    const response = await fetch('https://api2.hackclub.com/v0.1/Tarot/users');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching user data:', error);
    return null;
  }
}

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

function createCardElement(key, card, userCards = []) {
  const cardDiv = document.createElement('div');
  cardDiv.className = 'card';
  
  // Add owned class if the user has this card
  if (userCards.includes(key)) {
    cardDiv.classList.add('owned');
  }
  
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

function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    slackId: params.get('slack_id')
  };
}

// Initialize when the DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  const { slackId } = getUrlParams();
  let userCards = [];

  // Only fetch user data if slack_id is present
  if (slackId) {
    const userData = await fetchUserData();
    if (userData) {
      // Find the user's data
      const user = userData.find(u => u.fields.slack_uid === slackId);
      if (user) {
        console.log('Found user data:', user);
        // Parse the user's cards from the hand field
        userCards = user.fields.hand.split(',').map(card => card.trim());
      }
    }
  }

  const cards = await loadCardData();
  if (cards && typeof cards === 'object') {
    // Create container for cards
    const container = createCardsContainer();
    
    // Convert cards object to array and sort based on ownership
    const sortedCards = Object.entries(cards).sort(([keyA], [keyB]) => {
      const aOwned = userCards.includes(keyA);
      const bOwned = userCards.includes(keyB);
      if (aOwned && !bOwned) return -1;
      if (!aOwned && bOwned) return 1;
      return 0;
    });
    
    // Create and append each card
    sortedCards.forEach(([key, card]) => {
      const cardElement = createCardElement(key, card, userCards);
      container.appendChild(cardElement);
    });
    
    // Find the Arcana section and append the cards container
    const arcanaSection = document.getElementById('arcana');
    arcanaSection.appendChild(container);

    // Initialize scramble effect after cards are added
    initScrambledText();

    // If slack_id is present, scroll to the Arcana section
    if (slackId) {
      arcanaSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } else {
    console.error('Invalid cards data:', cards);
  }
}); 