import express from 'express'
import { SlackBot } from './slack.js'
import { transcript } from './transcript.js'
import { kv } from './kv.js'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdir } from 'fs/promises'
import fileUpload from 'express-fileupload'
import { cleanupOldFiles } from './garbage_collection.js'
import { healthCheck, hackatimeStats, submitStretch, getMoments } from './api.js'

const app = express()
const port = process.env.PORT || 3030
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Trust proxy to get real IP address
app.set('trust proxy', true);

// Airtable configuration
const AIRTABLE_BASE_ID = "appOkhzTn4Z3FI9gv"
const AIRTABLE_TABLE_NAME = 'moments'

// Initialize Slack bot with your token and channel ID
const slackToken = process.env.SLACK_BOT_TOKEN
const slackChannelId = 'C08LESAQASG'

if (!slackToken) {
  console.error('Missing required environment variable: SLACK_BOT_TOKEN')
  process.exit(1)
}

const slackBot = new SlackBot(slackToken, slackChannelId)

// Ensure uploads directory exists
try {
  await mkdir(path.join(__dirname, '../docs/temp'), { recursive: true })
} catch (err) {
  if (err.code !== 'EEXIST') {
    console.error('Error creating temp directory:', err)
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupOldFiles, 10 * 60 * 1000);

// Run initial cleanup
cleanupOldFiles();

// Middleware to parse JSON bodies with increased limit
app.use(express.json({ limit: '100mb' }))
app.use(express.urlencoded({ extended: true, limit: '100mb' }))

// Middleware to handle file uploads
app.use(fileUpload({
  limits: { 
    fileSize: 100 * 1024 * 1024, // 100MB max file size
  },
  abortOnLimit: true,
  limitHandler: function(req, res, next) {
    return res.status(413).json({ 
      error: 'File too large',
      message: 'The video file must be smaller than 100MB'
    });
  },
  createParentPath: true,
  useTempFiles: true,
  tempFileDir: '/tmp/'
}))

// Error handling middleware
app.use((err, req, res, next) => {
  if (err.status === 413) {
    return res.status(413).json({
      error: 'File too large',
      message: 'The video file must be smaller than 100MB'
    });
  }
  next(err);
});

// Serve static files from the docs directory
app.use(express.static(path.join(__dirname, '../docs')))

// API endpoints
app.get('/up', healthCheck)
app.get('/api/hackatime/stats/:slackId', hackatimeStats)
app.get('/api/moments', getMoments)
app.post('/api/submit-stretch', submitStretch)

// Slack events endpoint
app.post('/slack/events', async (req, res) => {
  // Handle Slack URL verification
  if (req.body.type === 'url_verification') {
    console.log('Handling URL verification')
    return res.json({ challenge: req.body.challenge })
  }

  // Handle message events
  if (req.body.event?.type === 'message') {
    await slackBot.handleMessageEvent(req.body.event)
  }

  res.json({ ok: true })
})

// Start server
app.listen(port, async () => {
  console.log(transcript('startup', { port }))
}) 