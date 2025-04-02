import path from 'path'
import { readFile, writeFile } from 'fs/promises'

// Airtable configuration
const AIRTABLE_BASE_ID = "appOkhzTn4Z3FI9gv"
const AIRTABLE_TABLE_NAME = 'moments'

// Health check endpoint
export function healthCheck(req, res) {
  res.json({ status: 'ok' })
}

// Proxy endpoint for Hackatime API
export async function hackatimeStats(req, res) {
  try {
    const { slackId } = req.params;
    const response = await fetch(`https://hackatime.hackclub.com/api/v1/users/${slackId}/stats?features=projects&start_date=2025-04-02`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching Hackatime stats:', error);
    res.status(500).json({ error: 'Failed to fetch Hackatime stats' });
  }
}

// Stretch submission endpoint
export async function submitStretch(req, res) {
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

    // Get total project time from Hackatime
    const hackatimeResponse = await fetch(`https://hackatime.hackclub.com/api/v1/users/${slack_id}/stats?features=projects&start_date=2025-04-02`);
    if (!hackatimeResponse.ok) {
      throw new Error('Failed to fetch Hackatime stats');
    }
    const hackatimeData = await hackatimeResponse.json();
    
    // Find this project's total seconds
    const projectStats = hackatimeData.projects.find(p => p.name === project);
    if (!projectStats) {
      throw new Error(`Project "${project}" not found in Hackatime data`);
    }
    const totalProjectSeconds = projectStats.total_seconds;
    console.log('Total project seconds from Hackatime:', totalProjectSeconds);

    // Get previous stretches for this project from our API
    const momentsResponse = await fetch('https://api2.hackclub.com/v0.1/Tarot/moments');
    if (!momentsResponse.ok) {
      throw new Error('Failed to fetch previous moments');
    }
    const moments = await momentsResponse.json();
    
    // Calculate total seconds from previous stretches for this project
    const previousStretchSeconds = moments
      .filter(m => m.fields.slack_uid === slack_id && m.fields.project === project)
      .reduce((sum, m) => sum + (m.fields.duration_seconds || 0), 0);
    console.log('Previous stretch seconds:', previousStretchSeconds);

    // Calculate new stretch duration
    const durationSeconds = Math.max(0, totalProjectSeconds - previousStretchSeconds);
    console.log('New stretch duration_seconds:', durationSeconds);

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
    const tempPath = path.join(process.cwd(), 'docs/temp', urlFriendlyName);
    
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
          'duration_seconds': durationSeconds,
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
      duration_seconds: durationSeconds
    });

  } catch (error) {
    console.error('Error submitting stretch:', error);
    res.status(500).json({ error: error.message || 'Failed to submit stretch' });
  }
}

// Get previous moments endpoint
export async function getMoments(req, res) {
  console.log('GET /api/moments request received:', {
    query: req.query,
    headers: req.headers
  });
  
  try {
    const { slack_id } = req.query;
    
    if (!slack_id) {
      console.log('No slack_id provided');
      return res.status(400).json({ 
        error: 'Missing required parameter: slack_id'
      });
    }

    // Sanitize slack_id to prevent injection
    const safeSlackId = slack_id.replace(/[^a-zA-Z0-9]/g, '');
    console.log('Sanitized slack_id:', { original: slack_id, sanitized: safeSlackId });
    
    const response = await fetch('https://api2.hackclub.com/v0.1/Tarot/moments');
    console.log('API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
      throw new Error(`Failed to fetch moments: ${errorText}`);
    }

    const data = await response.json();
    console.log(`Found ${data.length} total moments`);
    
    // Filter moments for this user
    const userMoments = data.filter(record => record.fields.slack_uid === safeSlackId);
    console.log(`Found ${userMoments.length} moments for user ${safeSlackId}`);
    
    // Map the records to match our expected format
    const mappedData = {
      records: userMoments.map(record => ({
        id: record.id,
        fields: {
          hours: record.fields.hours || 0,
          status: record.fields.status || 'pending',
          description: record.fields.description || '',
          project: record.fields.project || '',
          created: record.fields.Created || ''
        }
      }))
    };
    
    res.json(mappedData);
  } catch (error) {
    console.error('Error in getMoments:', error);
    res.status(500).json({ 
      error: 'Failed to fetch moments',
      details: error.message
    });
  }
} 