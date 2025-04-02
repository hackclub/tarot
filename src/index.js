import express from 'express'
import { SlackBot } from './slack.js'
import { transcript } from './transcript.js'
import { kv } from './kv.js'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdir, readFile, writeFile } from 'fs/promises'
import fileUpload from 'express-fileupload'
import { cleanupOldFiles } from './garbage_collection.js'

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

// Health check endpoint
app.get('/up', (req, res) => {
  res.json({ status: 'ok' })
})

// Proxy endpoint for Hackatime API
app.get('/api/hackatime/stats/:slackId', async (req, res) => {
  try {
    const { slackId } = req.params;
    const response = await fetch(`https://hackatime.hackclub.com/api/v1/users/${slackId}/stats?features=projects&start_date=2025-04-01`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching Hackatime stats:', error);
    res.status(500).json({ error: 'Failed to fetch Hackatime stats' });
  }
});

// Stretch submission endpoint
app.post('/api/submit-stretch', async (req, res) => {
  try {
    console.log('Received submission request:');
    console.log('- Content-Type:', req.headers['content-type']);
    console.log('- Content-Length:', req.headers['content-length']);
    console.log('- Files:', Object.keys(req.files || {}));
    
    const { slack_id, project, description } = req.body;
    
    if (!slack_id || !project || !description || !req.files?.video) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['slack_id', 'project', 'description', 'video']
      });
    }

    const video = req.files.video;

    // Validate video file
    if (!video.mimetype.startsWith('video/')) {
      return res.status(400).json({ 
        error: 'Invalid video file'
      });
    }

    // Save file to temp directory first
    const randomPrefix = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const urlFriendlyName = `${randomPrefix}-${video.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const tempPath = path.join(__dirname, '../docs/temp', urlFriendlyName);
    
    // Copy file to temp directory
    await readFile(video.tempFilePath).then(buffer => writeFile(tempPath, buffer));
    
    // Get the base URL from the request's host header
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers.host;
    const baseUrl = `${protocol}://${host}`;
    
    console.log('File saved at:', tempPath);
    console.log('Public URL:', `${baseUrl}/temp/${urlFriendlyName}`);

    // Create Airtable record with all data including attachment
    const airtablePayload = {
      records: [{
        fields: {
          'slack_uid': slack_id,
          'project': project,
          'description': description,
          'user_agent': req.headers['user-agent'],
          'ip_address': req.ip,
          'attachment': [{
            url: `${baseUrl}/temp/${urlFriendlyName}`,
            filename: video.name
          }]
        }
      }]
    };
    console.log('Airtable payload:', airtablePayload);
    
    const airtableResponse = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(airtablePayload)
    });

    console.log('Airtable response:', airtableResponse.status);
    const responseText = await airtableResponse.text();
    
    if (!airtableResponse.ok) {
      console.error('Airtable error:', responseText);
      throw new Error(`Failed to create Airtable record: ${responseText}`);
    }

    const result = JSON.parse(responseText);
    console.log('Airtable result:', result);
    
    res.json({ 
      status: 'success',
      message: 'Stretch submitted successfully',
    });

  } catch (error) {
    console.error('Error submitting stretch:', error);
    res.status(500).json({ error: error.message || 'Failed to submit stretch' });
  }
});

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