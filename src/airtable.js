// every 30 sec, list all users in kv & upsert their records in airtable

import { Glob } from "bun"
import { kv } from "./kv"

const airtableBase = "appOkhzTn4Z3FI9gv"

const getHand = async (username) => {
  // get the hand from airtable
  // username should alphanumeric, nothing else, and start with U
  const safeUsername = username.replace(/[^a-zA-Z0-9]/g, '')
  const filterFormula = `{slack_uid} = '${safeUsername}'`
  const maxRecords = 1
  const select = {
    fields: ['hand'],
    filterByFormula: filterFormula,
    maxRecords: maxRecords
  }

  const response = await fetch(`https://api.airtable.com/v0/${airtableBase}/users`, {
    headers: {
      'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`
    },
    method: 'GET',
    body: JSON.stringify(select)
  })
  const data = await response.json()
  return data?.records[0]?.fields?.hand
}

export { getHand }

const updateAirtableHands = async () => {
  const glob = new Glob("./kv/user_hand:*")
  const userHands = []
  for await (const file of glob.scan(".")) {
    const username = file.split(":")[1]
    const hand = await kv.get(`user_hand:${username}`, true)
    userHands.push({ fields: { slack_uid: username, hand: hand.toString() } })
  }

  // update in batches of 10
  for (let i = 0; i < userHands.length; i += 10) {
    const batch = userHands.slice(i, i + 10)
    console.log('Sending batch to Airtable:', JSON.stringify(batch, null, 2))
    const response = await fetch(`https://api.airtable.com/v0/${airtableBase}/users`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        performUpsert: {
          fieldsToMergeOn: ['slack_uid']
        },
        records: batch
      })
    })
    const result = await response.json()
    console.log('Airtable response:', JSON.stringify(result, null, 2))
  }

  const numOfRequests = Math.ceil(userHands.length / 10)
  const waitTime = numOfRequests * 1000 + (5 * 1000)
  console.log('Waiting', waitTime, 'ms before next batch')
  setTimeout(updateAirtableHands, waitTime)
}