
```
- (the fool): ooooh! what’s this deck of cards doing here?
- (the fool): DRAW
- (the deck) @fool draws a card: The Tower. They hold 1 card in their hand
- (the fool): INSPECT
- (the fool): Huh, that doesn’t seems like me at all– I’m really quite short! Well, that’s fine, a new day brings new experiences!
- (the fool): DRAW
- (the deck) @fool draws a card, but it’s just an empty card. Perhaps more need to draw for this to work?
- (continues until 10 people have drawn)
- (the fool): ooooh, I wanna draw some more!
- (the fool): DRAW
- (the deck): @fool draws another card: The Lovers
- (the fool): What is this, valentine’s day?! Nope! Not for me!
- (the fool): DISCARD
- (the deck): @fool attempts to discard. As they pull it out of their hand it vanishes into a puff of smoke.
```

# hand size

users start out only holding 2 cards

at 30 users, 2 cards

at 50 users, 3 cards

at 100, 4 cards

at 150 users, 5 cards

# Drawing chances:

- DRAW
  - user's first card? give them a card always!
  - after that, 3/(MIN(USER_COUNT, 100)) chance of drawing a card
  - 30 sec cooldown on calling DRAW
- DISCARD
  - you can always DISCARD, but you want to use it sparingly b/c DRAWing takes time
  - you can only DISCARD the latest card

USER_COUNT
  - total number of people who have a hand
