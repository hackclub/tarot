const { App } = require('@slack/bolt');
const { drawCard } = require('./card'); // Import the drawCard function

const app = new App({
  token: process.env.SLACK_BOT_TOKEN, // Your bot token
  signingSecret: process.env.SLACK_SIGNING_SECRET, // Your signing secret
});

// Listen for messages in Slack
app.message(async ({ message, say }) => {
  const channelName = message.channel; // Replace with logic to get the channel name if needed

  if (channelName === 'C12345678') { // Replace with the actual channel ID for #draw-tarot
    const drawnCard = drawCard("#draw-tarot");
    if (drawnCard) {
      await say(`You drew: ${drawnCard}`);
    }
  } else {
    await say("This command only works in the #draw-tarot channel.");
  }
});

// Start the Slack bot
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Slack bot is running!');
})();