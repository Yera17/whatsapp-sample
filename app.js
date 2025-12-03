const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { GoogleGenAI } = require('@google/genai');
const app = express();

app.use(express.json());

const port = process.env.PORT || 3000;
// Ensure these are set in your .env file or environment variables
const verifyToken = process.env.VERIFY_TOKEN;
const whatsappToken = process.env.WHATSAPP_TOKEN;
const phoneId = process.env.PHONE_ID;
const geminiKey = process.env.GEMINI_KEY;

// Initialize Google Gen AI SDK (New Syntax)
const ai = new GoogleGenAI({ apiKey: geminiKey });

// Server URL for game links
const SERVER_URL = process.env.SERVER_URL || 'https://whatsapp-sample-6906.onrender.com';

// ---- Games Folder Setup ----
const gamesFolder = path.join(__dirname, 'games');
if (!fs.existsSync(gamesFolder)) {
  fs.mkdirSync(gamesFolder, { recursive: true });
}

// Serve static game files
app.use('/games', express.static(gamesFolder));

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
        await sendWhatsAppMessage(responseTo, `🎮 Creating your game... Please wait!`);
        
        // Get the user's last message as game prompt
        const userMessages = memory[from].filter(m => m.role === 'user' && !m.text.startsWith('['));
        const gamePrompt = userMessages[userMessages.length - 1]?.text || 'a fun simple game';
        
        console.log(`Creating game based on: "${gamePrompt}"`);
        
        // Generate HTML5 game
        const gameHtml = await generateGameHTML(gamePrompt);
        
        if (gameHtml) {
          // Generate unique filename
          const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const gameFileName = `${gameId}.html`;
          const gamePath = path.join(gamesFolder, gameFileName);
          
          // Save game file
          fs.writeFileSync(gamePath, gameHtml);
          
          // Create game URL
          const gameUrl = `${SERVER_URL}/games/${gameFileName}`;
          
          // Save to user's library
          memory[from].push({ 
            role: 'user', 
            text: `[Created Game: ${gamePrompt}]` 
          });
          memory[from].push({ 
            role: 'assistant', 
            text: `Game created: ${gameUrl}`,
            gameData: { id: gameId, prompt: gamePrompt, url: gameUrl, createdAt: new Date().toISOString() }
          });
          saveMemory(memory);
          
          // Send game link to user
          await sendWhatsAppMessage(responseTo, 
            `🎮 *Your game is ready!*\n\n` +
            `📝 Based on: "${gamePrompt}"\n\n` +
            `🔗 Play here:\n${gameUrl}\n\n` +
            `Have fun! Send /start to create another game.`
          );
        } else {
          await sendWhatsAppMessage(responseTo, `😔 Sorry, couldn't create the game. Please try again with a different description.`);
        }
        break;

      case 'library':
        // Handle Library action - show user's created games
        const games = memory[from]
          .filter(m => m.gameData)
          .map(m => m.gameData);
        
        if (games.length === 0) {
          await sendWhatsAppMessage(responseTo, 
            `📚 *Your Library*\n\n` +
            `You haven't created any games yet!\n\n` +
            `Send a game idea and then /start to create one.`
          );
        } else {
          let libraryMsg = `📚 *Your Library* (${games.length} games)\n\n`;
          games.slice(-10).forEach((game, i) => {
            libraryMsg += `${i + 1}. ${game.prompt}\n🔗 ${game.url}\n\n`;
          });
          libraryMsg += `Send /start to create a new game!`;
          await sendWhatsAppMessage(responseTo, libraryMsg);
        }
        break;

      default:
        await sendWhatsAppMessage(responseTo, "Unknown option selected.");
    }
  } catch (err) {
    console.error('Error handling button click:', err.response?.data || err.message);
    await sendWhatsAppMessage(responseTo, "Sorry, something went wrong. Please try again.");
  }
}

// ---- Generate HTML5 Game with Gemini ----
async function generateGameHTML(gamePrompt) {
  try {
    const systemPrompt = `You are an expert HTML5 game developer. Create a complete, self-contained HTML5 game based on the user's request.

REQUIREMENTS:
- Output ONLY the HTML code, no explanations or markdown
- Must be a single HTML file with embedded CSS and JavaScript
- Must be mobile-friendly (touch controls) and work on all screen sizes
- Must be visually appealing with good colors and styling
- Include a title, instructions, and game area
- Add a "Play Again" button
- Make it fun and engaging!
- Use canvas or DOM-based game mechanics
- Include score tracking if applicable

The game should be based on: "${gamePrompt}"

Output only the complete HTML code starting with <!DOCTYPE html> and ending with </html>.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
      config: {
        maxOutputTokens: 8192,
        temperature: 0.7
      }
    });

    let gameCode = response.text || '';
    
    // Clean up the response - extract HTML if wrapped in markdown
    if (gameCode.includes('```html')) {
      gameCode = gameCode.split('```html')[1].split('```')[0];
    } else if (gameCode.includes('```')) {
      gameCode = gameCode.split('```')[1].split('```')[0];
    }
    
    // Ensure it starts with DOCTYPE
    gameCode = gameCode.trim();
    if (!gameCode.toLowerCase().startsWith('<!doctype')) {
      // Try to find the start of HTML
      const doctypeIndex = gameCode.toLowerCase().indexOf('<!doctype');
      if (doctypeIndex !== -1) {
        gameCode = gameCode.substring(doctypeIndex);
      }
    }
    
    console.log(`Generated game HTML (${gameCode.length} chars)`);
    return gameCode;

  } catch (error) {
    console.error("Game generation error:", error);
    return null;
  }
}

// ---- Gemini Request (Gemini 2.5 Pro) ----
async function getGeminiResponse(conversation) {
  try {
    // Convert conversation format to SDK format
    const contents = conversation.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    }));

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: contents,
      config: {
        maxOutputTokens: 1024,
      }
    });
    
    let responseText = response.text || "No response text found.";
    
    // Ensure response doesn't exceed 4096 characters (WhatsApp limit)
    if (responseText.length > 4096) {
      responseText = responseText.substring(0, 4096);
    }
    
    return responseText;

  } catch (error) {
    console.error("Gemini API Error details:", error);
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

app.listen(port, () => console.log(`Listening on port ${port}`));const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { GoogleGenAI } = require('@google/genai');
const app = express();

app.use(express.json());

const port = process.env.PORT || 3000;
// Ensure these are set in your .env file or environment variables
const verifyToken = process.env.VERIFY_TOKEN;
const whatsappToken = process.env.WHATSAPP_TOKEN;
const phoneId = process.env.PHONE_ID;
const geminiKey = process.env.GEMINI_KEY;

// Initialize Google Gen AI SDK (New Syntax)
const ai = new GoogleGenAI({ apiKey: geminiKey });

// Server URL for game links
const SERVER_URL = process.env.SERVER_URL || 'https://whatsapp-sample-6906.onrender.com';

// ---- Games Folder Setup ----
const gamesFolder = path.join(__dirname, 'games');
if (!fs.existsSync(gamesFolder)) {
  fs.mkdirSync(gamesFolder, { recursive: true });
}

// Serve static game files
app.use('/games', express.static(gamesFolder));

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
        await sendWhatsAppMessage(responseTo, `🎮 Creating your game... Please wait!`);
        
        // Get the user's last message as game prompt
        const userMessages = memory[from].filter(m => m.role === 'user' && !m.text.startsWith('['));
        const gamePrompt = userMessages[userMessages.length - 1]?.text || 'a fun simple game';
        
        console.log(`Creating game based on: "${gamePrompt}"`);
        
        // Generate HTML5 game
        const gameHtml = await generateGameHTML(gamePrompt);
        
        if (gameHtml) {
          // Generate unique filename
          const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const gameFileName = `${gameId}.html`;
          const gamePath = path.join(gamesFolder, gameFileName);
          
          // Save game file
          fs.writeFileSync(gamePath, gameHtml);
          
          // Create game URL
          const gameUrl = `${SERVER_URL}/games/${gameFileName}`;
          
          // Save to user's library
          memory[from].push({ 
            role: 'user', 
            text: `[Created Game: ${gamePrompt}]` 
          });
          memory[from].push({ 
            role: 'assistant', 
            text: `Game created: ${gameUrl}`,
            gameData: { id: gameId, prompt: gamePrompt, url: gameUrl, createdAt: new Date().toISOString() }
          });
          saveMemory(memory);
          
          // Send game link to user
          await sendWhatsAppMessage(responseTo, 
            `🎮 *Your game is ready!*\n\n` +
            `📝 Based on: "${gamePrompt}"\n\n` +
            `🔗 Play here:\n${gameUrl}\n\n` +
            `Have fun! Send /start to create another game.`
          );
        } else {
          await sendWhatsAppMessage(responseTo, `😔 Sorry, couldn't create the game. Please try again with a different description.`);
        }
        break;

      case 'library':
        // Handle Library action - show user's created games
        const games = memory[from]
          .filter(m => m.gameData)
          .map(m => m.gameData);
        
        if (games.length === 0) {
          await sendWhatsAppMessage(responseTo, 
            `📚 *Your Library*\n\n` +
            `You haven't created any games yet!\n\n` +
            `Send a game idea and then /start to create one.`
          );
        } else {
          let libraryMsg = `📚 *Your Library* (${games.length} games)\n\n`;
          games.slice(-10).forEach((game, i) => {
            libraryMsg += `${i + 1}. ${game.prompt}\n🔗 ${game.url}\n\n`;
          });
          libraryMsg += `Send /start to create a new game!`;
          await sendWhatsAppMessage(responseTo, libraryMsg);
        }
        break;

      default:
        await sendWhatsAppMessage(responseTo, "Unknown option selected.");
    }
  } catch (err) {
    console.error('Error handling button click:', err.response?.data || err.message);
    await sendWhatsAppMessage(responseTo, "Sorry, something went wrong. Please try again.");
  }
}

// ---- Generate HTML5 Game with Gemini ----
async function generateGameHTML(gamePrompt) {
  try {
    const systemPrompt = `You are an expert HTML5 game developer. Create a complete, self-contained HTML5 game based on the user's request.

REQUIREMENTS:
- Output ONLY the HTML code, no explanations or markdown
- Must be a single HTML file with embedded CSS and JavaScript
- Must be mobile-friendly (touch controls) and work on all screen sizes
- Must be visually appealing with good colors and styling
- Include a title, instructions, and game area
- Add a "Play Again" button
- Make it fun and engaging!
- Use canvas or DOM-based game mechanics
- Include score tracking if applicable

The game should be based on: "${gamePrompt}"

Output only the complete HTML code starting with <!DOCTYPE html> and ending with </html>.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
      config: {
        maxOutputTokens: 8192,
        temperature: 0.7
      }
    });

    let gameCode = response.text || '';
    
    // Clean up the response - extract HTML if wrapped in markdown
    if (gameCode.includes('```html')) {
      gameCode = gameCode.split('```html')[1].split('```')[0];
    } else if (gameCode.includes('```')) {
      gameCode = gameCode.split('```')[1].split('```')[0];
    }
    
    // Ensure it starts with DOCTYPE
    gameCode = gameCode.trim();
    if (!gameCode.toLowerCase().startsWith('<!doctype')) {
      // Try to find the start of HTML
      const doctypeIndex = gameCode.toLowerCase().indexOf('<!doctype');
      if (doctypeIndex !== -1) {
        gameCode = gameCode.substring(doctypeIndex);
      }
    }
    
    console.log(`Generated game HTML (${gameCode.length} chars)`);
    return gameCode;

  } catch (error) {
    console.error("Game generation error:", error);
    return null;
  }
}

// ---- Gemini Request (Gemini 2.5 Pro) ----
async function getGeminiResponse(conversation) {
  try {
    // Convert conversation format to SDK format
    const contents = conversation.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    }));

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: contents,
      config: {
        maxOutputTokens: 1024,
      }
    });
    
    let responseText = response.text || "No response text found.";
    
    // Ensure response doesn't exceed 4096 characters (WhatsApp limit)
    if (responseText.length > 4096) {
      responseText = responseText.substring(0, 4096);
    }
    
    return responseText;

  } catch (error) {
    console.error("Gemini API Error details:", error);
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
