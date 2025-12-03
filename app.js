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

// ---- Phone Number Mapping ----
// Maps sender numbers to response numbers
const phoneMapping = {
  '77784392573': '787784392573',
  '77767465901': '787767465901'
};

function getResponseNumber(senderNumber) {
  return phoneMapping[senderNumber] || senderNumber;
}

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

  if (!message) return;

  const from = message.from; // WhatsApp sender ID
  const responseTo = getResponseNumber(from); // Get mapped response number

  console.log(`From: ${from} → Response to: ${responseTo}`);

  // Handle interactive button replies
  if (message.type === 'interactive') {
    const buttonReply = message.interactive?.button_reply;
    if (buttonReply) {
      console.log(`User (${from}) clicked button: ${buttonReply.id} - ${buttonReply.title}`);
      await handleButtonClick(from, responseTo, buttonReply.id);
      return;
    }
  }

  // Handle text messages
  if (message.type !== 'text') return;

  const text = message.text?.body || '';
  console.log(`User (${from}): ${text}`);

  // 2. Load memory
  const memory = loadMemory();
  memory[from] = memory[from] || [];

  // 3. Append user message to history
  memory[from].push({ role: 'user', text });

  // 4. Save memory
  saveMemory(memory);

  try {
    // Check if user sent "/start" command
    if (text.trim().toLowerCase() === '/start') {
      // Send interactive buttons
      await sendInteractiveButtons(
        responseTo,
        `Hey! Welcome to Prompt2Play 🎮\n\nWhat would you like to do?`,
        `Choose an option below`,
        [
          { id: 'create_game', title: 'Create Game' },
          { id: 'library', title: 'Library' }
        ]
      );
    } else {
      // Regular message - process with Gemini AI
      const aiReply = await getGeminiResponse(memory[from]);
      console.log(`Gemini Reply: ${aiReply}`);

      // Append AI reply to history
      memory[from].push({ role: 'assistant', text: aiReply });
      saveMemory(memory);

      // Send reply back to WhatsApp
      await sendWhatsAppMessage(responseTo, aiReply);
    }

  } catch (err) {
    console.error('Error in processing loop:', err.response?.data || err.message);
  }
});

// ---- Handle Button Click ----
async function handleButtonClick(from, responseTo, buttonId) {
  const memory = loadMemory();
  memory[from] = memory[from] || [];

  try {
    switch (buttonId) {
      case 'create_game':
        // Handle Create Game action
        memory[from].push({ role: 'user', text: '[Selected: Create Game]' });
        
        const gamePrompt = memory[from].filter(m => m.role === 'user').slice(-2, -1)[0]?.text || '';
        const gameResponse = await getGeminiResponse([
          ...memory[from],
          { role: 'user', text: `Create a fun interactive game based on: "${gamePrompt}". Be creative and engaging!` }
        ]);
        
        memory[from].push({ role: 'assistant', text: gameResponse });
        saveMemory(memory);
        await sendWhatsAppMessage(responseTo, `🎮 *Creating your game!*\n\n${gameResponse}`);
        break;

      case 'library':
        // Handle Library action
        memory[from].push({ role: 'user', text: '[Selected: Library]' });
        
        const libraryResponse = await getGeminiResponse([
          ...memory[from],
          { role: 'user', text: 'Show me what\'s in my library. List any games or content we\'ve created together.' }
        ]);
        
        memory[from].push({ role: 'assistant', text: libraryResponse });
        saveMemory(memory);
        await sendWhatsAppMessage(responseTo, `📚 *Your Library*\n\n${libraryResponse}`);
        break;

      default:
        await sendWhatsAppMessage(responseTo, "Unknown option selected.");
    }
  } catch (err) {
    console.error('Error handling button click:', err.response?.data || err.message);
    await sendWhatsAppMessage(responseTo, "Sorry, something went wrong. Please try again.");
  }
}

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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        contents: contents,
        generationConfig: {
          maxOutputTokens: 1024  // Approximately 4096 characters
        }
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    let responseText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response text found.";
    
    // Ensure response doesn't exceed 4096 characters
    if (responseText.length > 4096) {
      responseText = responseText.substring(0, 4096);
    }
    
    return responseText;

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

// ---- WhatsApp Interactive Reply Buttons ----
async function sendInteractiveButtons(to, bodyText, footerText, buttons) {
  try {
    // Build buttons array (max 3 buttons allowed by WhatsApp)
    const buttonObjects = buttons.slice(0, 3).map(btn => ({
      type: "reply",
      reply: {
        id: btn.id,
        title: btn.title.substring(0, 20) // Max 20 characters for button title
      }
    }));

    const res = await axios.post(
      `https://graph.facebook.com/v20.0/${phoneId}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: {
            text: bodyText.substring(0, 1024) // Max 1024 characters
          },
          footer: {
            text: footerText.substring(0, 60) // Max 60 characters
          },
          action: {
            buttons: buttonObjects
          }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${whatsappToken}`,
          "Content-Type": "application/json"
        }
      }
    );
    console.log("Interactive buttons sent successfully");
  } catch (err) {
    console.error("WhatsApp interactive buttons error:", err.response?.data || err.message);
  }
}

// Root route
app.get('/', (req, res) => res.send("WhatsApp Gemini Bot is running!"));

app.listen(port, () => console.log(`Listening on port ${port}`));
