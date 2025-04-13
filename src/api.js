import path from 'path'
import { readFile, writeFile } from 'fs/promises'
import { getUser, getUserByAuthToken } from './airtable.js'
import { transcript } from './transcript.js'

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
    const { auth_token, project, description, selected_cards } = req.body;
    
    if (!auth_token || !project || !description || !req.files?.video) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['auth_token', 'project', 'description', 'video']
      });
    }

    // Get user data from Airtable using auth token
    const decodedAuthToken = decodeURIComponent(auth_token);
    const user = await getUserByAuthToken(decodedAuthToken);
    
    if (!user) {
      return res.status(401).json({
        error: 'Invalid auth token'
      });
    }

    const slack_id = user.fields.slack_uid;

    // Get total project time from Hackatime
    const hackatimeResponse = await fetch(`https://hackatime.hackclub.com/api/v1/users/${slack_id}/stats?features=projects&start_date=2025-04-02`);
    if (!hackatimeResponse.ok) {
      throw new Error('Failed to fetch Hackatime stats');
    }
    const hackatimeData = await hackatimeResponse.json();

    // Find this project's total seconds
    if (!hackatimeData || !hackatimeData.data || !hackatimeData.data.projects) {
      throw new Error('Invalid Hackatime response format');
    }

    const projectStats = hackatimeData.data.projects.find(p => p.name === project);
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
          'selected_cards': selected_cards || '',
          'attachment': [{
            url: `${baseUrl}/temp/${urlFriendlyName}`,
            filename: video.name
          }]
        }
      }]
    };
    
    const airtableResponse = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(airtablePayload)
    });

    const responseText = await airtableResponse.text();
    
    if (!airtableResponse.ok) {
      console.error('Airtable error:', responseText);
      throw new Error(`Failed to create Airtable record: ${responseText}`);
    }

    const result = JSON.parse(responseText);
    
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
  try {
    const { slack_id } = req.query;
    
    if (!slack_id) {
      return res.status(400).json({ 
        error: 'Missing required parameter: slack_id'
      });
    }

    // Sanitize slack_id to prevent injection
    const safeSlackId = slack_id.replace(/[^a-zA-Z0-9]/g, '');
    
    const response = await fetch('https://api2.hackclub.com/v0.1/Tarot/moments');
    if (!response.ok) {
      throw new Error(`Failed to fetch moments: ${await response.text()}`);
    }

    const data = await response.json();
    
    // Filter moments for this user and send raw data
    const userMoments = data.filter(record => record.fields.slack_uid === safeSlackId);
    res.json({ records: userMoments });
    
  } catch (error) {
    console.error('Error in getMoments:', error);
    res.status(500).json({ error: 'Failed to fetch moments' });
  }
}

// Get user's cards endpoint
export async function getCards(req, res) {
  try {
    const { slack_id } = req.query;
    
    if (!slack_id) {
      return res.status(400).json({ 
        error: 'Missing required parameter: slack_id'
      });
    }

    // Sanitize slack_id to prevent injection
    const safeSlackId = slack_id.replace(/[^a-zA-Z0-9]/g, '');
    
    // Get user's hand
    const { hand } = await getUser(safeSlackId);
    
    // If no cards found, user doesn't exist
    if (!hand || hand.length === 0) {
      return res.status(404).json({
        error: 'User not found'
      });
    }
    
    // Get card details from transcript
    const cards = hand.map(cardId => {
      const cardData = transcript(`cards.${cardId}`);
      return {
        id: cardId,
        name: cardData.name || cardId,
        requirements: cardData.requirements || '',
        flavor: cardData.flavor || []
      };
    });
    
    res.json(cards);
  } catch (error) {
    console.error('Error getting cards:', error);
    res.status(500).json({ error: 'Failed to get cards' });
  }
}

// Get all submission page data in one call
export async function getSubmissionData(req, res) {
  try {
    const { auth_token } = req.query;
    
    if (!auth_token) {
      return res.status(400).json({ 
        error: 'Missing required parameter: auth_token'
      });
    }

    const decodedAuthToken = decodeURIComponent(auth_token);
    const user = await getUserByAuthToken(decodedAuthToken);
    
    if (!user) {
      return res.status(401).json({
        error: 'Invalid auth token'
      });
    }

    const slack_id = user.fields.slack_uid;

    if (!user.fields.hand || user.fields.hand.split(',').length === 0) {
      return res.status(404).json({
        error: 'User not found'
      });
    }
    
    const [moments, speedrunRecordings, hackatimeResponse] = await Promise.all([
      fetch('https://api2.hackclub.com/v0.1/Tarot/moments').then(async r => {
        if (!r.ok) throw new Error(`Failed to fetch moments: ${await r.text()}`);
        const data = await r.json();
        // Filter moments for this user
        return data.filter(record => record.fields.slack_uid === slack_id);
      }),
      fetch('https://api2.hackclub.com/v0.1/Tarot/speedrun_recordings').then(async r => {
        if (!r.ok) throw new Error(`Failed to fetch speedrun recordings: ${await r.text()}`);
        const data = await r.json();
        // Filter recordings for this user
        return data.filter(record => record.fields.creator_slack_id === slack_id);
      }),
      fetch(`https://hackatime.hackclub.com/api/v1/users/${slack_id}/stats?features=projects&start_date=2025-04-02`)
    ]);

    // Check if hackatime response is ok
    if (!hackatimeResponse.ok) {
      console.error('Hackatime API error:', {
        status: hackatimeResponse.status,
        statusText: hackatimeResponse.statusText,
        url: hackatimeResponse.url
      });
      const errorText = await hackatimeResponse.text();
      console.error('Hackatime error response:', errorText);
      
      if (hackatimeResponse.status === 404) {
        return res.status(404).json({
          error: 'No Hackatime account found with your Slack ID. Please sign up at https://hackatime.hackclub.com'
        });
      }
      
      throw new Error(`Hackatime API error: ${hackatimeResponse.status} ${hackatimeResponse.statusText}`);
    }

    // Try to parse hackatime response
    let hackatimeStats;
    try {
      const responseText = await hackatimeResponse.text();
      console.log('Raw hackatime response:', responseText);
      hackatimeStats = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse hackatime response:', parseError);
      throw new Error('Invalid JSON response from Hackatime API');
    }

    const cards = user.fields.hand.split(',').map(cardId => {
      const cardData = transcript(`cards.${cardId}`);
      return {
        id: cardId,
        name: cardData.name || cardId,
        requirements: cardData.requirements || '',
        flavor: cardData.flavor || []
      };
    });

    console.log('Successfully prepared response with:', {
      cards: cards.length,
      moments: moments.length,
      speedrunRecordings: speedrunRecordings.length,
      projects: hackatimeStats?.data?.projects?.length || 0
    });

    // Return all data in the format expected by the frontend
    res.json({
      cards,
      moments,
      speedrunRecordings,
      projects: hackatimeStats?.data?.projects || []
    });
  } catch (error) {
    console.error('Error getting submission data:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to get submission data' });
  }
}

// Speedrun submission endpoint
export async function submitSpeedrun(req, res) {
  try {
    const { auth_token, project, description, start_date, end_date, slack_thread_url } = req.body;
    
    if (!auth_token || !project || !description || !start_date || !end_date || !slack_thread_url || !req.files?.video) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['auth_token', 'project', 'description', 'start_date', 'end_date', 'slack_thread_url', 'video']
      });
    }

    // Get user data from Airtable using auth token
    const decodedAuthToken = decodeURIComponent(auth_token);
    const user = await getUserByAuthToken(decodedAuthToken);
    
    if (!user) {
      return res.status(401).json({
        error: 'Invalid auth token'
      });
    }

    const slack_id = user.fields.slack_uid;
    
    // Validate video file
    const video = req.files.video;
    if (!video.mimetype.startsWith('video/')) {
      return res.status(400).json({
        error: 'File must be a video'
      });
    }

    // Save video to temp directory
    const tempDir = path.join(process.cwd(), 'temp');
    const videoPath = path.join(tempDir, `${Date.now()}-${video.name}`);
    await video.mv(videoPath);

    // Calculate duration in seconds
    const startTime = new Date(start_date);
    const endTime = new Date(end_date);
    const durationSeconds = Math.floor((endTime - startTime) / 1000);

    // Create record in Airtable
    const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_SPEEDRUN_TABLE_NAME}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        records: [{
          fields: {
            creator_slack_id: slack_id,
            project: project,
            description: description,
            start_date: start_date,
            end_date: end_date,
            duration_seconds: durationSeconds,
            slack_thread_url: slack_thread_url,
            status: 'Pending',
            video: [{
              url: videoPath
            }]
          }
        }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Airtable error:', errorData);
      return res.status(500).json({
        error: 'Failed to create speedrun recording in Airtable'
      });
    }

    res.json({
      success: true,
      message: 'Speedrun recording submitted successfully'
    });
  } catch (error) {
    console.error('Error submitting speedrun recording:', error);
    res.status(500).json({
      error: 'Failed to submit speedrun recording'
    });
  }
}

// Get speedrun recordings for a user
export async function getSpeedrunRecordings(req, res) {
  try {
    const { slack_id } = req.query;
    
    if (!slack_id) {
      return res.status(400).json({ 
        error: 'Missing required parameter: slack_id'
      });
    }

    // Sanitize slack_id to prevent injection
    const safeSlackId = slack_id.replace(/[^a-zA-Z0-9]/g, '');
    
    // Fetch speedrun recordings from Airtable
    const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_SPEEDRUN_TABLE_NAME}?filterByFormula=SEARCH("${safeSlackId}",{creator_slack_id})`, {
      headers: {
        'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Airtable error:', errorData);
      return res.status(500).json({
        error: 'Failed to fetch speedrun recordings from Airtable'
      });
    }

    const data = await response.json();
    res.json(data.records || []);
  } catch (error) {
    console.error('Error getting speedrun recordings:', error);
    res.status(500).json({ error: 'Failed to get speedrun recordings' });
  }
}