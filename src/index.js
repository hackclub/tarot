import express from 'express'
import { SlackBot } from './slack.js'
import { transcript } from './transcript.js'
import { kv } from './kv.js'

const app = express()
const port = process.env.PORT || 3030

// Initialize Slack bot with your token and channel ID
const slackToken = process.env.SLACK_BOT_TOKEN
const slackChannelId = 'C08KN8PKPE3'

if (!slackToken) {
  console.error('Missing required environment variable: SLACK_BOT_TOKEN')
  process.exit(1)
}

const slackBot = new SlackBot(slackToken, slackChannelId)

// Middleware to parse JSON bodies
app.use(express.json())

// Health check endpoint
app.get('/up', (req, res) => {
  res.json({ status: 'ok' })
})

// Slack events endpoint
app.post('/slack/events', async (req, res) => {
  console.log('Received Slack event:', JSON.stringify(req.body, null, 2))
  
  // Handle Slack URL verification
  if (req.body.type === 'url_verification') {
    console.log('Handling URL verification')
    return res.json({ challenge: req.body.challenge })
  }

  // Handle message events
  if (req.body.event?.type === 'message') {
    console.log('Handling message event')
    await slackBot.handleMessageEvent(req.body.event)
  } else {
    console.log('Received non-message event:', req.body.event?.type)
  }

  res.json({ ok: true })
})

// Start server
app.listen(port, async () => {
  console.log(transcript('startup', { port }))

  console.log(transcript('bad_project_ideas.base'))
  kv.set('test', 'test', null, true)
  console.log(await kv.get('test', true))

  console.log(await kv.get('user_hand:U0C7B14Q3', true))

  // Only send initial message if no root message exists
  if (!slackBot.getRootMessage()) {
    console.log('No existing root message found, sending initial message...')
    await slackBot.initialMessage()
  } else {
    console.log('Using existing root message:', slackBot.getRootMessage())
  }
}) 