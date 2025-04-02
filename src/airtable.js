const airtableBase = "appOkhzTn4Z3FI9gv"

const addToHand = async (username, card) => {
  const currentUser = await getUser(username)
  const newHand = [...currentUser.hand, card]

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
}

const getUser = async (username) => {
  // get the hand from airtable
  // username should alphanumeric, nothing else, and start with U
  const safeUsername = username.replace(/[^a-zA-Z0-9]/g, '')

  const url = `https://api.airtable.com/v0/appOkhzTn4Z3FI9gv/users?filterByFormula=%7Bslack_uid%7D%3D'${safeUsername}'&maxRecords=1`
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`
    }
  })
  
  if (!response.ok) {
    console.error('Failed to fetch user from Airtable:', response.status, response.statusText);
    throw new Error('Failed to fetch user');
  }
  
  const data = await response.json();
  const user = data.records[0];

  return {
    hand: user?.fields?.hand?.split(',') || [],
    auth_token: user?.fields?.auth_token
  }
}

const getUserByAuthToken = async (authToken) => {
  const allowedChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-^*();:[]'
  const safeAuthToken = Array.from(authToken).filter(c => allowedChars.includes(c)).join('')
  const select = {
    maxRecords: 1,
    filterByFormula: `{auth_token} = '${safeAuthToken}'`
  }
  const url = 'https://api2.hackclub.com/v0.1/Tarot/users?select='+ JSON.stringify(select)
  const response = await fetch(url)
  const data = await response.json()
  return data[0]
}

export { getUser, addToHand, getUserByAuthToken }