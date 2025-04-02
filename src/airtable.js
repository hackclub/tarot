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
  console.log('Looking up user with safeUsername:', safeUsername);

  const response = await fetch('https://api2.hackclub.com/v0.1/Tarot/users')
  if (!response.ok) {
    console.error('Failed to fetch users from Airtable:', response.status, response.statusText);
    throw new Error('Failed to fetch users');
  }
  const data = await response.json();
  
  const user = data.find(record => record.fields.slack_uid === safeUsername)

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