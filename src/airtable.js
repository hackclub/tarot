const airtableBase = "appOkhzTn4Z3FI9gv"

const addToHand = async (username, card) => {
  const currentHand = await getHand(username)
  const newHand = [...currentHand, card]

  console.log({newHand})

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
      records: [{ fields: { slack_uid: username, hand: newHand.toString() } }]
    })
  }).then(res => res.json())
  console.log({response})
}

const getHand = async (username) => {
  // get the hand from airtable
  // username should alphanumeric, nothing else, and start with U
  const safeUsername = username.replace(/[^a-zA-Z0-9]/g, '')

  const response = await fetch('https://api2.hackclub.com/v0.1/Tarot/users')
  const data = await response.json()
  console.log(data)
  const user = data.find(record => record.fields.slack_uid === safeUsername)
  console.log({user})
  return user?.fields?.hand?.split(',') || []
}

export { getHand, addToHand }