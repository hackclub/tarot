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

  async sendMessage(message, threadTs = null, username = null) {
    try {
      const messageParams = {
        channel: this.channelId,
        text: message
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

  async drawCard(messageTs, username) {
    // check if the user has already drawn a card in the past 30 seconds
    const userMention = username.startsWith('U') ? `<@${username}>` : username
    await this.react(messageTs, 'beachball')

    // handle global user count
    // by searching kv for "user_hand:"
    console.time('getUserCounts')
    const userCounts = await getUserCounts()
    console.timeEnd('getUserCounts')

    let maxHandSize = 4
    if (userCounts > 150) {
      maxHandSize = 5
    } else if (userCounts > 100) {
      maxHandSize = 4
    } else if (userCounts > 50) {
      maxHandSize = 3
    } else if (userCounts > 30) {
      maxHandSize = 2
    }

    try {
      let message = userMention + ' ' + transcript('drawing.start') + '...'
      console.log("message", message)

      // get the user's hand
      let userHand = await kv.get(`user_hand:${username}`, true)
      if (!userHand) {
        userHand = []
      }

      if (userHand.length >= maxHandSize) {
        message += ' ' + transcript('drawing.too_many')
      } else {
        // Check rate limiting
        const lastDraw = await kv.get(`card_draw:${username}`)
        if (lastDraw) {
          message += ' ' + transcript('drawing.too_soon')
        } else {
          kv.set(`card_draw:${username}`, true, 30 * 1000)

          const allCards = transcript('cards')
          const cardKeys = Object.keys(allCards)
          const availableCards = cardKeys.filter(key => !userHand.includes(key))
          const randomCard = availableCards[Math.floor(Math.random() * availableCards.length)]
          userHand.push(randomCard)
          kv.set(`user_hand:${username}`, userHand, null, true)

          const chosenCard = allCards[randomCard]
          const flavor = transcript('cards.' + randomCard + '.flavor')

          message += ` and draws *${chosenCard.name}*!\n_${flavor}_\n\nRequirements: \`\`\`${chosenCard.requirements}\`\`\``

          // include user's hand count
          if (userHand.length == maxHandSize) {
            message += ' ' + transcript('hand.full')
          } else {
            message += ' ' + transcript('hand.count', { count: userHand.length, pluralCard: userHand.length == 1 ? 'card' : 'cards' })
          }
        }
      }

      // Send the card result
      console.time('respondToMessage')
      await Promise.all([
        this.react(messageTs, 'beachball', false),
        this.react(messageTs, 'white_check_mark', true),
        this.sendMessage(message, messageTs)
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

  async handleMessageEvent(event) {
    try {
      // Verify the message is in our channel
      if (event.channel !== this.channelId) {
        // console.log('Message is not in our channel, ignoring')
        return
      }
      
      if (event.thread_ts === this.rootMessage?.messageTs) {
        // Check if the message is "DRAW"
        if (event.text.trim().toUpperCase() === 'DRAW') {
          // If it's a bot message, use the bot's username, otherwise use the user's ID
          const username = event.bot_id ? 'The Fool' : event.user
          console.time('drawCard')
          await this.drawCard(event.ts, username)
          console.timeEnd('drawCard')
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