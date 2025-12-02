const express = require('express');
const fs = require('fs');
const axios = require('axios');
const app = express();

app.use(express.json());

const port = process.env.PORT || 3000;
// Ensure these are set in your .env file or environment variables
const verifyToken = process.env.VERIFY_TOKEN;
const whatsappToken = process.env.WHATSAPP_TOKEN;
const phoneId = process.env.PHONE_ID;
const geminiKey = process.env.GEMINI_KEY;

// ---- Load / Save JSON memory ----
const memoryFile = 'memory.json';

function loadMemory() {
  try {
    if (fs.existsSync(memoryFile)) {
      return JSON.parse(fs.readFileSync(memoryFile, 'utf8'));
    }
    return {};
  } catch (err) {
    console.error("Error loading memory:", err);
    return {};
  }
}

function saveMemory(memory) {
  try {
    fs.writeFileSync(memoryFile, JSON.stringify(memory, null, 2));
  } catch (err) {
    console.error("Error saving memory:", err);
  }
}

// ---- WHATSAPP WEBHOOK VERIFICATION ----
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const challenge = req.query['hub.challenge'];
  const token = req.query['hub.verify_token'];

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WEBHOOK VERIFIED');
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// ---- WHATSAPP WEBHOOK POST HANDLER ----
app.post('/webhook', async (req, res) => {
  // 1. Respond immediately to WhatsApp to prevent timeout
  res.sendStatus(200);

  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`\n\nWebhook received ${timestamp}`);

  const entry = req.body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;
  const message = value?.messages?.[0];

  // Check if it's a text message
  if (!message || message.type !== 'text') return;

  const from = message.from; // WhatsApp sender ID
  const text = message.text?.body || '';

  console.log(`User (${from}): ${text}`);

  // 2. Load memory
  const memory = loadMemory();
  memory[from] = memory[from] || [];

  // 3. Append user message to history
  memory[from].push({ role: 'user', text });

  try {
    // 4. Call Gemini AI with history
    const aiReply = await getGeminiResponse(memory[from]);

    console.log(`Gemini Reply: ${aiReply}`);

    // 5. Append AI reply to history
    memory[from].push({ role: 'assistant', text: aiReply });

    // 6. Save memory to file
    saveMemory(memory);

    // 7. Send reply back to WhatsApp
    await sendWhatsAppMessage(from, aiReply);

  } catch (err) {
    console.error('Error in processing loop:', err.response?.data || err.message);
  }
});

// ---- Gemini Request (FIXED MODEL VERSION) ----
async function getGeminiResponse(conversation) {
  try {
    const contents = conversation.map(msg => ({
      // Your local 'assistant' role is correctly mapped to the API's 'model' role
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    }));

    // *** FIX IS HERE: Changed 'gemini-pro' to 'gemini-1.0-pro' ***
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.0-pro:generateContent?key=${geminiKey}`,
      {
        contents: contents
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response text found.";

  } catch (error) {
    // Note: The error details you provided (the 404) are logged here.
    console.error("Gemini API Error details:", error.response?.data || error.message);
    return "Sorry, I am having trouble connecting to the AI right now.";
  }
}

// ---- WhatsApp Send API ----
async function sendWhatsAppMessage(to, body) {
  try {
    const res = await axios.post(
      `https://graph.facebook.com/v20.0/${phoneId}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body }
      },
      {
        headers: {
          Authorization: `Bearer ${whatsappToken}`,
          "Content-Type": "application/json"
        }
      }
    );
    // console.log("Message sent successfully");
  } catch (err) {
    console.error("WhatsApp send error:", err.response?.data || err.message);
  }
}

// Root route
app.get('/', (req, res) => res.send("WhatsApp Gemini Bot is running!"));

app.listen(port, () => console.log(`Listening on port ${port}`));
