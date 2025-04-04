import { WebClient } from "@slack/web-api"

export async function postOmgMoment() {
  const filterByFormula = `AND(
  BLANK() = file_post_id,
  {status} = "approved"
  )`
  const maxRecords = 1
  const select = {filterByFormula, maxRecords}
  const airtableResponse = await fetch(`https://api.airtable.com/v0/appOkhzTn4Z3FI9gv/moments?${new URLSearchParams(select)}`, {
    headers: {
      'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json'
    },
  }).then(res => res.json())

  const recordToPost = airtableResponse?.records[0]

  if (recordToPost) {
    const slack = new WebClient(process.env.SLACK_BOT_TOKEN)
    const {project, description, slack_uid, selected_cards, karma, duration_hours, attachment} = recordToPost.fields
    const {filename, url} = attachment?.[0]
    
    const fileResponse = await fetch(url)
    const fileBuffer = await fileResponse.arrayBuffer()
    const { upload_url, file_id } = await slack.files.getUploadURLExternal({
      filename: filename,
      length: fileBuffer.byteLength
    })
    const uploadResponse = await fetch(upload_url, {
      method: "POST",
      body: fileBuffer,
    })

    const message = `🔮 <@${slack_uid}>'s \`${project}\` OMG moment: \`\`\`${description}\`\`\` -- ${karma.toFixed(1)} karma in ${duration_hours.toFixed(1)} hours earned by playing these cards: \`${selected_cards}\``
    await slack.files.completeUploadExternal({
      files: [{id: file_id}],
      channel_id: "C08L60RUQ92",
      initial_comment: message
    })

    await fetch(`https://api.airtable.com/v0/appOkhzTn4Z3FI9gv/moments/${recordToPost.id}`, {
      method: "PATCH",
      headers: {
        'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          file_post_id: file_id
        }
      })
    })
    return true
  } else {
    return false
  }
}