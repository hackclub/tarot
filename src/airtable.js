// every 30 sec, list all users in kv & upsert their records in airtable

import { Glob } from "bun"
import { kv } from "./kv"

const airtableBase = "appOkhzTn4Z3FI9gv"

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
    await fetch(`https://api.airtable.com/v0/${airtableBase}/users`, {
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
    }).then(r => r.json())
  }

  const numOfRequests = Math.ceil(userHands.length / 10)
  setTimeout(updateAirtableHands, numOfRequests * 1000 + (5 * 1000))
}

updateAirtableHands()