import { WebClient } from '@slack/web-api'
import { transcript } from './transcript.js'
import { kv } from './kv.js'
import getUserCounts from './user_counts.js'

export class SlackBot {
  constructor(token, channelId) {
    // Log token type (first 4 chars) to verify we're using the right token
    this.client = new WebClient(token)
    this.channelId = channelId
    this.rootMessage = null
    this.loadRootMessage().then(msg => {
      this.rootMessage = msg
    })
  }

  async loadRootMessage() {
    try {
      const rootMessage = await kv.get('root_message', true)
      return rootMessage
    } catch (error) {
      console.error('Error loading root message:', error)
    }
    return null
  }

  saveRootMessage() {
    try {
      kv.set('root_message', this.rootMessage, null, true)
    } catch (error) {
      console.error('Error saving root message:', error)
    }
  }

  async sendMessage(message, threadTs = null, username = null, contextMessage = null) {
    try {
      const messageParams = {
        channel: this.channelId,
        text: message
      }

      if (contextMessage) {
        messageParams.blocks = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: message
            }
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: contextMessage
              }
            ]
          }
        ]
      }

      if (threadTs) {
        messageParams.thread_ts = threadTs
      }
      if (username) {
        messageParams.username = username
        if (username === 'The Fool') {
          messageParams.icon_url = 'https://hc-cdn.hel1.your-objectstorage.com/s/v3/daaf9766396a84e2b083fbf37bac08ba23f768a1_image.png'
        }
      }
      
      const result = await this.client.chat.postMessage(messageParams)
      
      if (!threadTs) {
        this.rootMessage = {
          channelId: result.channel,
          messageTs: result.ts
        }
        this.saveRootMessage()
      }
      
      return result
    } catch (error) {
      console.error('Error sending message to Slack:', error)
      throw error
    }
  }

  async initialMessage() {
    try {
      // Send initial message with black joker
      const result = await this.sendMessage('🃏')
      
      // Wait 3 seconds
      await new Promise(resolve => setTimeout(resolve, 15 * 1000))
      
      // Send follow-up message in thread
      await this.sendMessage("ooooh! what's this deck of cards doing here?", result.ts, 'The Fool')

      // Wait 3 seconds
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Send follow-up message in thread
      await this.sendMessage("I kinda want to take one...", result.ts, 'The Fool')

      // Wait 3 seconds
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Send follow-up message in thread
      await this.sendMessage("DRAW", result.ts, 'The Fool')

      // Wait 3 seconds
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      return result
    } catch (error) {
      console.error('Error sending initial message:', error)
      throw error
    }
  }

  async drawCard(messageTs, username, userMention) {
    await this.react(messageTs, 'beachball')

    console.time('getUserCounts')
    const userCounts = await getUserCounts()
    console.timeEnd('getUserCounts')

    console.log("userCounts", userCounts)

    let prevUserCount = await kv.get('user_count', true)

    if (!prevUserCount) {
      prevUserCount = 0
    }

    let maxHandSize = await kv.get('max_hand_size', true)
    if (!maxHandSize) {
      maxHandSize = 2
      kv.set('max_hand_size', maxHandSize, null, true)
    }
    let prevMaxHandSize = maxHandSize

    const specialActions = [
      {
        count: 4,
        flag: 'tutorial_inspect',
        action: async () => {
          // the fool posts "wait, what did I have?"
          await this.sendMessage("wait, what did I have?", messageTs, 'The Fool')
          await new Promise(resolve => setTimeout(resolve, 3000))
          await this.sendMessage("INSPECT", messageTs, 'The Fool')
        }
      },
      // {
      //   count: 12,
      //   key: 'tutorial_discard',
      //   action: async () => {
      //     await this.sendMessage("I don't want this one...", messageTs)
      //     await new Promise(resolve => setTimeout(resolve, 3000))
      //     await this.sendMessage("DISCARD", messageTs, 'The Fool')
      //   }
      // },
      {
        count: 20,
        flag: 'deck_grows_1',
        action: async () => {
          maxHandSize = 3
          await kv.set('max_hand_size', maxHandSize, null, true)
          await this.sendMessage("As more crowd gathers, the deck grows larger. You can now hold 3 cards.", messageTs)
        }
      },
      {
        count: 35,
        flag: 'tutorial_hand',
        action: async () => {
          await this.sendMessage("Wait, what's this in my hand?", messageTs)
          await new Promise(resolve => setTimeout(resolve, 3000))
          await this.sendMessage("HAND", messageTs, 'The Fool')
        }
      },
      {
        count: 50,
        flag: 'deck_grows_2',
        action: async () => {
          maxHandSize = 4
          await kv.set('max_hand_size', maxHandSize, null, true)
          await this.sendMessage("As more crowd gathers, the deck grows larger... you think you can hold more cards?", messageTs)
        }
      },
      {
        count: 100,
        flag: 'deck_grows_3',
        action: async () => {
          maxHandSize = 5
          await kv.set('max_hand_size', maxHandSize, null, true)
          await this.sendMessage("As more crowd gathers, the deck grows larger.... you can now hold 5 cards", messageTs)
        }
      },
      {
        count: 110,
        flag: 'ending',
        action: async () => {
          await this.sendMessage("One animated card is now laid out on the table, and on it you see the depiction of a tassle-hatted fool juggling and dancing around.... it opens it's mouth as if to speak and words show up on the bottom of the card", messageTs)
        }
      }
    ]

    // these trigger on all requests once we have the count worth of users
    let regularActions = [
      {
        count: 1,
        action: async () => {
          if (Math.random() < 0.1) {
            await this.sendMessage(transcript('drawing.first_leg'), messageTs)
          }
        }
      },
      {
        count: 50,
        action: async () => {
          if (Math.random() < 0.1) {
            await this.sendMessage(transcript('drawing.second_leg'), messageTs)
          }
        }
      },
      {
        count: 100,
        action: async () => {
          if (Math.random() < 0.1) {
            await this.sendMessage(transcript('drawing.third_leg'), messageTs)
          }
        }
      },
    ]

    for (const action of specialActions) {
      const flagKey = 'flag_' + action.flag
      console.log("Checking action", action, userCounts, action.count, await kv.get(flagKey, true))
      if (userCounts >= action.count && !(await kv.get(flagKey, true))) {
        setTimeout(() => {
          action.action()
          kv.set(flagKey, true, null, true)
        }, 5 * 1000)
      }
    }

    for (const action of regularActions) {
      if (userCounts >= action.count) {
        action.action()
      }
    }

    kv.set('user_count', userCounts, null, true)
    // only set this if the max_hand_size has increased to prevent race conditions
    if (maxHandSize > prevMaxHandSize) {
      kv.set('max_hand_size', maxHandSize, null, true)
    }

    try {
      let message = userMention + ' ' + transcript('drawing.start') + '...'
      let contextMessage = ''
      console.log("message", message)

      // get the user's hand
      let userHand = await kv.get(`user_hand:${username}`, true)
      if (!userHand) {
        userHand = []
      }

      if (userHand.length >= maxHandSize) {
        message += ' ' + transcript('drawing.too_many')
        if (maxHandSize == 5) {
          contextMessage = "You're at the limit of how many cards you can hold in your hand!"
        } else {
          contextMessage = "Psst... you can hold more cards if more people join!"
        }
      } else {
        // Check rate limiting
        const lastDraw = await kv.get(`card_draw:${username}`)
        if (lastDraw) {
          message += ' ' + transcript('drawing.too_soon')
          contextMessage = "You're drawing too quickly! Slow down and try again after 30 seconds."
        } else {
          kv.set(`card_draw:${username}`, true, 30 * 1000)

          // If it's their first draw (empty hand) or they pass the probability check
          if (userHand.length === 0 || Math.random() < (1 / 2)) {
            const allCards = transcript('cards')
            const cardKeys = Object.keys(allCards)
            const availableCards = cardKeys.filter(key => !userHand.includes(key))
            const randomCard = availableCards[Math.floor(Math.random() * availableCards.length)]
            userHand.push(randomCard)
            kv.set(`user_hand:${username}`, userHand, null, true)

            const chosenCard = allCards[randomCard]
            const flavor = transcript('cards.' + randomCard + '.flavor')

            message += ` and draws *${chosenCard.name}*!\n_${flavor}_\n\nRequirements: \`\`\`${chosenCard.requirements}\`\`\``
            contextMessage = "Congrats!"

            // include user's hand count
            if (userHand.length == maxHandSize) {
              message += ' ' + transcript('hand.full')
            } else {
              message += ' ' + transcript('hand.count', { count: userHand.length, pluralCard: userHand.length == 1 ? 'card' : 'cards' })
            }
          } else {
            message += ' ' + transcript('drawing.no_dice')
            contextMessage = "Better luck next DRAW"
          }
        }
      }

      // Send the card result
      console.time('respondToMessage')
      await Promise.all([
        this.react(messageTs, 'beachball', false),
        this.react(messageTs, 'white_check_mark', true),
        this.sendMessage(message, messageTs, null, contextMessage)
      ])
      console.timeEnd('respondToMessage')
    } catch (error) {
      console.error('Error in drawCard:', error)
      throw error
    }
  }

  async react(messageTs, name, turnOn = true) {
    const reaction = turnOn ? 'add' : 'remove'
    try {
      await this.client.reactions[reaction]({
        channel: this.channelId,
        timestamp: messageTs,
        name: name
      })
    } catch (error) {
      console.error("Failed to react to message:", messageTs, "with name:", name, "and turnOn:", turnOn)
    }
  }

  async showHand(messageTs, username, userMention) {
    try {
      let [_reaction, _time, userHand] = await Promise.all([
        this.react(messageTs, 'beachball'),
        new Promise(resolve => setTimeout(resolve, 1000)),
        kv.get(`user_hand:${username}`, true)
      ])

      if (!userHand) {
        userHand = []
      }
      
      let response = userMention + " "
      if (userHand.length === 0) {
        response += transcript('hand.empty')
      } else {
        const allCards = transcript('cards')
        const handNames = userHand.map(cardKey => "`" + allCards[cardKey].name + "`").join(', ')
        response += transcript('hand.list', { cards: handNames })
      }

      await Promise.all([
        this.react(messageTs, 'beachball', false),
        this.react(messageTs, transcript('hand.emoji'), true),
        this.sendMessage(response, messageTs)
      ])
      
    } catch (error) {
      console.error('Error in showHand:', error)
      throw error
    }
  }

  async inspectCard(messageTs, username, userMention) {
    try {
      await this.react(messageTs, 'beachball')
      
      // get the user's hand
      let userHand = await kv.get(`user_hand:${username}`, true)
      if (!userHand || userHand.length === 0) {
        const message = userMention + ' ' + transcript('inspect.no_cards')
        await Promise.all([
          this.react(messageTs, 'beachball', false),
          this.react(messageTs, 'white_check_mark', true),
          this.sendMessage(message, messageTs)
        ])
        return
      }

      // Get the most recent card (last in the hand)
      const lastCardKey = userHand[userHand.length - 1]
      const allCards = transcript('cards')
      const card = allCards[lastCardKey]
      const flavor = transcript('cards.' + lastCardKey + '.flavor')

      const message = `${userMention} inspects *${card.name}*...\n\n_${flavor}_\n\nRequirements: \`\`\`${card.requirements}\`\`\``
      
      await Promise.all([
        this.react(messageTs, 'beachball', false),
        this.react(messageTs, 'white_check_mark', true),
        this.sendMessage(message, messageTs)
      ])
    } catch (error) {
      console.error('Error in inspectCard:', error)
      throw error
    }
  }

  async handleMessageEvent(event) {
    try {
      // Verify the message is in our channel
      if (event.channel !== this.channelId) {
        // console.log('Message is not in our channel, ignoring')
        return
      }
      
      if (event.thread_ts === this.rootMessage?.messageTs) {
        const command = event.text.trim().toUpperCase()
        const username = event.bot_id ? 'The Fool' : event.user
        const userMention = username.startsWith('U') ? `<@${username}>` : username

        if (command === 'DRAW') {
          console.time('drawCard')
          await this.drawCard(event.ts, username, userMention)
          console.timeEnd('drawCard')
        } else if (command === 'HAND') {
          console.time('showHand')
          await this.showHand(event.ts, username, userMention)
          console.timeEnd('showHand')
        } else if (command === 'INSPECT') {
          console.time('inspectCard')
          await this.inspectCard(event.ts, username, userMention)
          console.timeEnd('inspectCard')
        }
      } else {
        // console.log('Message is not in our thread, ignoring')
      }
    } catch (error) {
      console.error('Error handling message event:', error)
    }
  }

  getRootMessage() {
    return this.rootMessage
  }
} 