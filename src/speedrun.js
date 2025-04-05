import { kv } from "./kv.js"
import { WebClient } from "@slack/web-api"
import { transcript } from "./transcript.js"

const slack = new WebClient(process.env.SLACK_BOT_TOKEN)

async function getScheduledSpeedruns() {
  // get speedruns from all time, save to kv
  const airtableResponse = await fetch(`https://api.airtable.com/v0/appOkhzTn4Z3FI9gv/speedruns`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json'
    },
  }).then(res => res.json())

  const scheduledSpeedruns = airtableResponse?.records
  await kv.set("scheduled_speedruns", scheduledSpeedruns, null, true)
}

async function updateOpenHuddle(huddle) {
  const roomId = huddle?.call_id
  const huddleCreator = huddle?.created_by
  const startDate = huddle.start_date * 1000 // slack returns unix timestamp in seconds
  const threadRootTs = huddle.thread_root_ts
  const activeMembers = huddle.active_members
  const isOwnerInHuddle = activeMembers.includes(huddleCreator)
  const nonOwnerMembers = activeMembers.filter(member => member !== huddleCreator)

  const kvKey = "room:" + roomId
  let callData = await kv.get(kvKey, true)
  if (!callData) {
    // if we find this room on airtable, we use that record
    const airtableResponse = await fetch(`https://api.airtable.com/v0/appOkhzTn4Z3FI9gv/speedrun_recordings`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        performUpsert: {
          fieldsToMergeOn: ['slack_room_id']
        },
        records: [{ fields: {
          slack_room_id: roomId,
          creator_slack_id: huddleCreator,
          start_date: new Date(startDate),
          thread_root_ts: threadRootTs
        } }]
      })
    }).then(res => res.json())
    callData = airtableResponse?.records?.[0]
    await kv.set(kvKey, { 
      ...callData, 
      fields: { 
        ...callData.fields,  // Keep existing fields
        latest_reminder_ts: new Date() 
      } 
    }, null, true)
    const callCreated = airtableResponse?.createdRecords?.[0]
    console.log("callCreated", callCreated)
    if (callCreated?.fields) {
      await slack.chat.postMessage({
        channel: "C08L60RUQ92",
        text: transcript('speedrun.start', { slack_id: callCreated.fields.creator_slack_id }),
        thread_ts: callCreated.fields.thread_root_ts
      })
    }
  }

  if (!isOwnerInHuddle) {
    await slack.chat.postMessage({
      channel: "C08L60RUQ92",
      text: transcript('speedrun.no_owner', { slack_id: callData.fields.creator_slack_id }),
      thread_ts: callData.fields.thread_root_ts
    })
  } else if (nonOwnerMembers.length == 0) {
    await slack.chat.postMessage({
      channel: "C08L60RUQ92",
      text: transcript('speedrun.no_members', { slack_id: callData.fields.creator_slack_id }),
      thread_ts: callData.fields.thread_root_ts
    })
  }
  // post a reminder in thread if latest_reminder_ts is more than 15 minutes ago
  // & the call was started more than 15 minutes ago
  const latestReminderTs = callData?.fields?.latest_reminder_ts
  const callStartedAt = callData?.fields?.start_date
  console.log({callStartedAt})

  console.log("latestReminderTs", latestReminderTs)
  console.log("callStartedAt", callStartedAt)

  const callOldEnough = new Date(callStartedAt) < Date.now() - 15 * 60 * 1000
  const reminderOldEnough = !latestReminderTs || new Date(latestReminderTs) < Date.now() - 15 * 60 * 1000

  if (callOldEnough && reminderOldEnough) {
    // post in slack
    const slackPost = slack.chat.postMessage({
      channel: "C08L60RUQ92",
      text: transcript('speedrun.reminder', { slack_id: callData.fields.creator_slack_id }),
      thread_ts: callData.fields.thread_root_ts
    })
    const airtablePost = fetch(`https://api.airtable.com/v0/appOkhzTn4Z3FI9gv/speedrun_recordings`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        records: [{ id: callData.id, fields: { latest_reminder_ts: new Date() } }]
      })
    })
    const kvUpdate = kv.set(kvKey, { 
      ...callData, 
      fields: { 
        ...callData.fields,  // Keep existing fields
        latest_reminder_ts: new Date() 
      } 
    }, null, true)

    await Promise.all([slackPost, airtablePost, kvUpdate])
  }
}

async function closeOldHuddles(openHuddle) {
  // mark the end date on any huddles that don't have one
  const filters = [
    'TRUE()',
    `BLANK() = end_date`
  ]
  if (openHuddle?.call_id) {
    filters.push(`slack_room_id != "${openHuddle.call_id}"`)
  }
  const filterByFormula = `AND(${filters.join(',')})`
  const airtableResponse = await fetch(`https://api.airtable.com/v0/appOkhzTn4Z3FI9gv/speedrun_recordings?filterByFormula=${filterByFormula}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json'
    },
  }).then(res => res.json())

  const callsToClose = airtableResponse?.records

  console.log("need to close", callsToClose.length, "calls")

  // update calls in batches of 10
  const endDate = new Date()
  for (let i = 0; i < callsToClose.length; i += 10) {
    const batch = callsToClose.slice(i, i + 10)
    const airtableResponse = await fetch(`https://api.airtable.com/v0/appOkhzTn4Z3FI9gv/speedrun_recordings`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        records: batch.map(call => ({ id: call.id, fields: { end_date: endDate } }))
      })
    })
    batch.forEach(call => {
      kv.set(`room:${call.fields.slack_room_id}`, { 
        ...call, 
        fields: { 
          ...call.fields,  // Keep existing fields
          end_date: endDate 
        } 
      }, null, true)
      slack.chat.postMessage({
        channel: "C08L60RUQ92",
        text: transcript('speedrun.ended', { slack_id: call.fields.creator_slack_id }),
        thread_ts: call.fields.thread_root_ts
      })
    })
  }
}

async function searchForHuddles() {
  const huddleData = await fetch("https://edgeapi.slack.com/cache/T0266FRGM/huddles/info", {
    "headers": {
      "Cookie": `d=${process.env.SPEEDRUN_SLACK_XOXD}`
    },
    "body": JSON.stringify({
      "token": process.env.SPEEDRUN_SLACK_XOXC,
      "channel_ids": ["C08L60RUQ92"]
    }),
    "method": "POST",
  }).then(res => res.json())

  if (!huddleData.ok) { return }
  const huddle = huddleData.huddles[0]
  if (huddle) {
    await updateOpenHuddle(huddle)
    await closeOldHuddles(huddle)
  } else {
    await closeOldHuddles()
  }

}

searchForHuddles()
setInterval(searchForHuddles, 60 * 1000)
