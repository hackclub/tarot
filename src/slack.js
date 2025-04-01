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
      const file = Bun.file('.rootmessage')
      if (await file.exists()) {
        const text = await file.text()
        return JSON.parse(text)
      }
    } catch (error) {
      console.error('Error loading root message:', error)
    }
    return null
  }

  saveRootMessage() {
    try {
      Bun.write('.rootmessage', JSON.stringify(this.rootMessage))
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
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      // Send follow-up message in thread
      await this.sendMessage("ooooh! what's this deck of cards doing here?", result.ts, 'The Fool')

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

    const specialActions = [
      {
        count: 4,
        key: 'tutorial_inspect',
        action: async () => {
          // the fool posts "wait, what did I have?"
          await this.sendMessage("wait, what did I have?", messageTs, 'The Fool')
          await new Promise(resolve => setTimeout(resolve, 3000))
          await this.sendMessage("INSPECT", messageTs, 'The Fool')
        }
      },
      {
        count: 20,
        flag: 'deck_grows_1',
        action: async () => {
          await this.sendMessage("As more crowd gathers, the deck grows larger.", messageTs)
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
      }
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

    kv.set('user_count', userCounts, null, true)
    
    let maxHandSize = 2
    if (userCounts > 150) {
      maxHandSize = 5
    } else if (userCounts > 100) {
      maxHandSize = 4
    } else if (userCounts > 30) {
      maxHandSize = 3
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
          contextMessage = "You're drawing too quickly! Slow down and try again."
        } else {
          kv.set(`card_draw:${username}`, true, 30 * 1000)

          // If it's their first draw (empty hand) or they pass the probability check
          if (userHand.length === 0 || Math.random() < (3 / Math.min(userCounts, 100))) {
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