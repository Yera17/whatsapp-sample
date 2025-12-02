const express = require('express');
const fs = require('fs');
const axios = require('axios');
const app = express();

app.use(express.json());

const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;
const whatsappToken = process.env.WHATSAPP_TOKEN;
const phoneId = process.env.PHONE_ID;
const geminiKey = process.env.GEMINI_KEY;

// ---- Load / Save JSON memory ----
const memoryFile = 'memory.json';

function loadMemory() {
  try {
    return JSON.parse(fs.readFileSync(memoryFile, 'utf8'));
  } catch (err) {
    return {};
  }
}

function saveMemory(memory) {
  fs.writeFileSync(memoryFile, JSON.stringify(memory, null, 2));
}

// ---- WHATSAPP WEBHOOK VERIFICATION ----
app.get('/', (req, res) => {
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
app.post('/', async (req, res) => {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`\n\nWebhook received ${timestamp}\n`);
  console.log(JSON.stringify(req.body, null, 2));
  res.sendStatus(200); // Respond quickly

  const entry = req.body.entry?.[0];
  const changes = entry?.changes?.[0];
  const message = changes?.value?.messages?.[0];

  if (!message) return;

  const from = message.from;
  const text = message.text?.body || '';

  // Load memory
  const memory = loadMemory();
  memory[from] = memory[from] || [];

  // Append user message
  memory[from].push({ role: 'user', text });

  try {
    // Call Gemini AI
    const aiReply = await getGeminiResponse(memory[from]);

    // Append AI reply to memory
    memory[from].push({ role: 'assistant', text: aiReply });

    // Save memory
    saveMemory(memory);

    // Send reply back to WhatsApp
    await sendWhatsAppMessage(from, aiReply);

  } catch (err) {
    console.error('Error handling message:', err);
  }
});

// ---- Gemini Request ----
async function getGeminiResponse(conversation) {
  // Build contents in Gemini format
  const contents = conversation.map(msg => ({
    author: msg.role,
    content: [{ type: 'text', text: msg.text }]
  }));

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiKey}`,
    { conversation: contents }
  );

  // Extract text from first candidate
  return response.data?.candidates?.[0]?.content?.[0]?.text || "Sorry, I couldn't respond.";
}

// ---- WhatsApp Send API ----
async function sendWhatsAppMessage(to, body) {
  await axios.post(
    `https://graph.facebook.com/v20.0/${phoneId}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      text: { body }
    },
    {
      headers: {
        Authorization: `Bearer ${whatsappToken}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// Optional root route
app.get('/', (req, res) => {
  res.send("Server is running");
});

app.listen(port, () => console.log(`Listening on port ${port}`));
