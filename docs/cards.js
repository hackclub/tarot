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

async function getUserKarma() {
  try {
    const { slackId } = getUrlParams();
    if (!slackId) return 0;

    const response = await fetch(`https://api2.hackclub.com/v0.1/Tarot/moments?select=%7B%22filterByFormula%22%3A%22%7Bslack_uid%7D%3D'${slackId}'%22%7D`);
    
    if (!response.ok) {
      throw new Error(`HTTP error, fix me please! Status code: ${response.status}`);
    }

    const data = await response.json();
    
    // Filter for approved projects and adds together their duration_seconds ( if there are multipled approved projects it adds them up)
    const totalSeconds = data
      .filter(item => item.fields.status === 'approved')
      .reduce((sum, item) => sum + item.fields.duration_seconds, 0);

    // Rounds down so their karma doesn't get artificially inflated.
    const karma = Math.floor(totalSeconds / 3600);
    
    return karma;
  } catch (error) {
    console.error('Error calculating karma:', error);
    return 0;
  }
}

// Initialize when the DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  const { slackId } = getUrlParams();
  let userCards = [];

  if (slackId) {
    const karma = await getUserKarma();
    console.log(`User karma: ${karma} hours`);

    const h2Elements = document.querySelectorAll('h2');
    const secondH2 = h2Elements[1];
    const karmaDisplay = document.createElement('p');
    karmaDisplay.style.cssText = `
      font-size: 1.5em;
      margin: -35px 0 5px 0;
      font-family: 'Cinzel', serif;
      color: #ffd700;
      text-align: center;
      text-shadow: 0 0 5px #ffd700, 0 0 10px #ffd700, 0 0 15px #ffd700;
    `;
    karmaDisplay.textContent = ` Your Karma: ${karma}`;
    secondH2.insertAdjacentElement('afterend', karmaDisplay);

    const userData = await fetchUserData();
    if (userData) {
      // Find the user's data
      const user = userData.find(u => u.fields.slack_uid === slackId);
      if (user) {
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
