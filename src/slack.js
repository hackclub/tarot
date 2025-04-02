import { WebClient } from '@slack/web-api'
import { transcript } from './transcript.js'
import { kv } from './kv.js'
import { getHand, addToHand } from './airtable.js'

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

  // async initialMessage() {
  //   try {
  //     // Send initial message with black joker
  //     const result = await this.sendMessage('🃏')
      
  //     // Wait 3 seconds
  //     await new Promise(resolve => setTimeout(resolve, 15 * 1000))
      
  //     // Send follow-up message in thread
  //     await this.sendMessage("ooooh! what's this deck of cards doing here?", result.ts, 'The Fool')

  //     // Wait 3 seconds
  //     await new Promise(resolve => setTimeout(resolve, 3000))

  //     // Send follow-up message in thread
  //     await this.sendMessage("I kinda want to take one...", result.ts, 'The Fool')

  //     // Wait 3 seconds
  //     await new Promise(resolve => setTimeout(resolve, 3000))

  //     // Send follow-up message in thread
  //     await this.sendMessage("DRAW", result.ts, 'The Fool')

  //     // Wait 3 seconds
  //     await new Promise(resolve => setTimeout(resolve, 3000))
      
  //     return result
  //   } catch (error) {
  //     console.error('Error sending initial message:', error)
  //     throw error
  //   }
  // }

  async drawCard(messageTs, username, userMention) {
    await this.react(messageTs, 'beachball')

    // Check rate limiting first
    const lastDraw = await kv.get(`card_draw:${username}`)
    if (lastDraw) {
      const message = userMention + ' ' + transcript('drawing.start') + '... ' + transcript('drawing.too_soon')
      const contextMessage = "You're drawing too quickly! Slow down and try again after 30 seconds."
      
      await Promise.all([
        this.react(messageTs, 'beachball', false),
        this.react(messageTs, 'white_check_mark', true),
        this.sendMessage(message, messageTs, null, contextMessage)
      ])
      return
    }

    // Set rate limit
    kv.set(`card_draw:${username}`, true, 30 * 1000)

    // hardcoded now that the launch is over
    const userCounts = 100
    const maxHandSize = 5

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
        count: 70,
        action: async () => {
          if (Math.random() < 0.1) {
            await this.sendMessage(transcript('drawing.third_leg'), messageTs)
          }
        }
      },
    ]

    for (const action of regularActions) {
      if (userCounts >= action.count) {
        action.action()
      }
    }

    try {
      let message = userMention + ' ' + transcript('drawing.start') + '...'
      let contextMessage = ''

      // get the user's hand
      let userHand = await getHand(username)

      if (userHand.length >= maxHandSize) {
        message += ' ' + transcript('drawing.too_many')
        contextMessage = "You're at the limit of how many cards you can hold in your hand!"
      } else {
        // If it's their first draw (empty hand) or they pass the probability check
        if (userHand.length === 0 || Math.random() < (1 / 1)) {
          const allCards = transcript('cards')
          const cardKeys = Object.keys(allCards)
          const availableCards = cardKeys.filter(key => !userHand.includes(key))
          const randomCard = availableCards[Math.floor(Math.random() * availableCards.length)]
          userHand.push(randomCard)
          await addToHand(username, randomCard)
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

  async showHand(messageTs, username, userMention, targetUsername = null) {
    try {
      let [_reaction, _time, userHand] = await Promise.all([
        this.react(messageTs, 'beachball'),
        new Promise(resolve => setTimeout(resolve, 1000)),
        getHand(targetUsername || username)
      ])

      if (!userHand) {
        userHand = []
      }
      
      let response = userMention + " "
      if (targetUsername) {
        response += `is looking at <@${targetUsername}>'s hand: `
      }
      
      if (userHand.length === 0) {
        response += transcript('hand.empty')
      } else {
        const allCards = transcript('cards')
        const handNames = userHand.map(cardKey => "`" + allCards[cardKey].name + "`").join(', ')
        response += transcript('hand.list', { cards: handNames })
      }

      // Only show the link if viewing your own hand
      if (!targetUsername) {
        response += `\n\nView your hand at: <https://hack.club/tarot/?slack_id=${username}|hack.club/tarot>`
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

  async handleMessageEvent(event) {
    try {
      // Verify the message is in our channel
      if (event.channel !== this.channelId) {
        // console.log('Message is not in our channel, ignoring')
        return
      }
      
      const text = event.text.trim()
      const command = text.toUpperCase()
      const username = event.bot_id ? 'The Fool' : event.user
      const userMention = username.startsWith('U') ? `<@${username}>` : username

      if (command === 'DRAW') {
        console.time('drawCard')
        await this.drawCard(event.ts, username, userMention)
        console.timeEnd('drawCard')
      } else if (command.startsWith('HAND')) {
        console.time('showHand')
        // Check if there's a mention in the command
        const mentionMatch = text.match(/HAND\s+<@([A-Z0-9]+)>/i)
        const targetUsername = mentionMatch ? mentionMatch[1] : null
        await this.showHand(event.ts, username, userMention, targetUsername)
        console.timeEnd('showHand')
      }
    } catch (error) {
      console.error('Error handling message event:', error)
    }
  }

  getRootMessage() {
    return this.rootMessage
  }
} 