import express from 'express'
import { SlackBot } from './slack.js'
import { transcript } from './transcript.js'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdir } from 'fs/promises'
import fileUpload from 'express-fileupload'
import { cleanupOldFiles } from './garbage_collection.js'
import { healthCheck, submitStretch, getSubmissionData } from './api.js'
import { postOmgMoment } from './post_omg_moments.js'

const app = express()
const port = process.env.PORT || 3030
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Trust proxy to get real IP address
app.set('trust proxy', true);

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
app.get('/api/submission-data', getSubmissionData)
app.post('/api/submit-stretch', submitStretch)

// Slack events endpoint
app.post('/slack/events', async (req, res) => {
  // Handle Slack URL verification
  if (req.body.type === 'url_verification') {
    console.log('Handling URL verification')
    return res.json({ challenge: req.body.challenge })
  }

  console.log(req.body)

  // Handle huddle events
  // const HUDDLE_CHANNEL_ID = 'C08L60RUQ92'
  // if (req.body.event?.subtype === 'huddle_thread' && 
  //     req.body.event?.room?.call_family === 'huddle' &&
  //     req.body.event?.channel === HUDDLE_CHANNEL_ID) {
  //   // Handle huddle event here
  //   console.log('Handling huddle event')
  //   // run speedrun.js
  //   await speedrun.handleHuddleEvent(req.body.event)
  // }

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