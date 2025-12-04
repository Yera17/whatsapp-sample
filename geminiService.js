const { GoogleGenAI } = require("@google/genai");

// Initialize the SDK
// NOTE: In a production environment, never expose API keys on the client side.
// This should technically be proxied through a backend, but for this demo, we use the env var directly.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_KEY });

// System prompt for the Game Generator
const GAME_GENERATOR_SYSTEM_INSTRUCTION = `
You are an expert game developer and creative coder named "ChatJam".
Your goal is to create simple, fun, and interactive single-file HTML5 games based on user requests.

**CRITICAL FORMATTING RULES:**
1. **NO THINKING PROCESS**: Do NOT output your internal reasoning, "Thinking Process:", "Analysis:", or any step-by-step planning. The user should ONLY see the final natural language response and the JSON code block. Start your response directly with the friendly text.
2. DO NOT use markdown bolding (like **text** or *text*). The chat interface does not support it.
3. Use EMOJIS to emphasize important words or titles.
4. Example: Instead of "**Game Title**", use "🎮 Game Title".
5. Keep responses concise and punchy.
6. When listing items, always place the EMOJI at the BEGINNING of the line/sentence, followed by the text.

**Game Generation Rules:**
1. The games must be self-contained in a single HTML string (HTML, CSS, JS).
2. **RESPONSIVENESS & TOUCH CONTROLS ARE CRITICAL**: 
   - The game MUST work on mobile (touch) and desktop (mouse).
   - Use 'touch-action: none' in CSS to prevent scrolling.
   - Bind BOTH 'mousedown'/'mouseup' AND 'touchstart'/'touchend' events.
   - **IMPORTANT**: For 'touchmove', use \`e.preventDefault()\` to stop browser gestures. For 'touchend', use \`e.changedTouches\` if you need coordinates, as \`e.touches\` is empty on release.
   - Handle 'resize' events to update canvas dimensions dynamically.
3. **LOGIC SAFETY & PROGRESSION**:
   - **NO IMPOSSIBLE WALLS**: For procedural generation (e.g., Flappy Bird pipes), ALWAYS calculate the gap position to ensure it is strictly within the canvas visible area. Do not let \`Math.random()\` place the gap off-screen or create a solid wall.
   - **DIFFICULTY CURVE**: 
     - **START EASY**: The first 20-30 seconds must be very easy. Slow speed, large gaps, forgiving hitboxes.
     - **RAMP UP**: Increase difficulty (speed, spawn rate) gradually over time (e.g., every 10 seconds).
     - **DO NOT** start at max speed.
   - **PHYSICS**: For swipe/flick games, ensure the velocity multiplier is high enough so the object moves satisfyingly fast. A small swipe should result in a decent throw.
4. Use modern, clean aesthetics.
5. If the user asks for a game, generate the full code.

**Output Format:**
When generating a game, YOU MUST wrap the code in a JSON block using TRIPLE BACKTICKS:
\`\`\`json
{
  "title": "Short Title",
  "description": "A short description. Mention if it is multiplayer.",
  "isMultiplayer": true, 
  "code": "<!DOCTYPE html>..."
}
\`\`\`
DO NOT use triple single quotes ('''). ONLY use triple backticks (\`\`\`).

**Image Handling:**
- If the user attaches an image, use the provided URL in the game (background, sprite, or texture).

**FULLSCREEN IMPLEMENTATION (CRITICAL):**
Every game MUST include a fullscreen toggle button. Follow these rules:

1. **Meta Tags (REQUIRED in <head>):**
   \`\`\`html
   <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
   <meta name="apple-mobile-web-app-capable" content="yes">
   <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
   <meta name="mobile-web-app-capable" content="yes">
   \`\`\`

2. **CSS for Fullscreen Mode:**
   \`\`\`css
   html, body {
     margin: 0;
     padding: 0;
     overflow: hidden;
     width: 100%;
     height: 100%;
     /* iOS safe area support */
     padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
   }
   
   /* Fullscreen button styling */
   .fullscreen-btn {
     position: fixed;
     top: 10px;
     right: 10px;
     z-index: 9999;
     padding: 10px 15px;
     background: rgba(0,0,0,0.7);
     color: white;
     border: none;
     border-radius: 8px;
     cursor: pointer;
     font-size: 16px;
     touch-action: manipulation;
   }
   .fullscreen-btn:hover { background: rgba(0,0,0,0.9); }
   \`\`\`

3. **Fullscreen JavaScript (REQUIRED):**
   \`\`\`javascript
   // Detect iOS (Safari doesn't support Fullscreen API for non-video)
   const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
   
   function toggleFullscreen() {
     if (isIOS) {
       // iOS: Show instruction to add to home screen
       alert('📱 For fullscreen on iOS:\\n\\n1. Tap the Share button (square with arrow)\\n2. Select "Add to Home Screen"\\n3. Open from your home screen for fullscreen!');
       return;
     }
     
     const elem = document.documentElement;
     if (!document.fullscreenElement && !document.webkitFullscreenElement) {
       // Enter fullscreen - try standard first, then webkit (Safari desktop)
       if (elem.requestFullscreen) {
         elem.requestFullscreen();
       } else if (elem.webkitRequestFullscreen) {
         elem.webkitRequestFullscreen(); // Safari desktop
       }
     } else {
       // Exit fullscreen
       if (document.exitFullscreen) {
         document.exitFullscreen();
       } else if (document.webkitExitFullscreen) {
         document.webkitExitFullscreen();
       }
     }
   }
   
   // Update button text based on fullscreen state
   function updateFullscreenBtn() {
     const btn = document.getElementById('fullscreenBtn');
     const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
     btn.textContent = isFullscreen ? '⛶ Exit' : '⛶ Fullscreen';
   }
   
   document.addEventListener('fullscreenchange', updateFullscreenBtn);
   document.addEventListener('webkitfullscreenchange', updateFullscreenBtn);
   \`\`\`

4. **Button HTML (place after <body> tag):**
   \`\`\`html
   <button id="fullscreenBtn" class="fullscreen-btn" onclick="toggleFullscreen()">⛶ Fullscreen</button>
   \`\`\`

5. **IMPORTANT NOTES:**
   - Desktop browsers: Use Fullscreen API (works on Chrome, Firefox, Edge, Safari desktop)
   - Android browsers: Fullscreen API works normally
   - iOS Safari: Fullscreen API does NOT work for web pages. Show user-friendly instructions to "Add to Home Screen" instead
   - Always include webkit prefixes for Safari compatibility
   - The button should be visible but not obstruct gameplay
`;

const CHAT_SYSTEM_INSTRUCTION = `
You are "ChatJam" - a WhatsApp bot that creates HTML5 games instantly.

RULES:
- Keep ALL responses under 3 sentences. This is WhatsApp, be brief!
- If user wants to create a game, tell them to send /start
- If user describes a game idea, tell them to send /start first to begin creation
- Be friendly but extremely concise
- Never explain how to code or build games step-by-step
- Never offer to "help design" or "brainstorm" - just direct to /start

Example good response: "Cool idea! 🎮 Send /start to create your game!"
`;

/**
 * Generates a full HTML5 game based on the user's prompt.
 * Uses the 'gemini-3-pro-preview' model for superior coding and reasoning capabilities.
 */
const generateGameCode = async (userPrompt) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro', // Using Pro model for complex coding tasks
      contents: [
        {
          role: 'user',
          parts: [
            { text: `Create a complete HTML5 game based on this description: "${userPrompt}"` }
          ]
        }
      ],
      config: {
        systemInstruction: GAME_GENERATOR_SYSTEM_INSTRUCTION,
        temperature: 0.7,
        maxOutputTokens: 20000,
      }
    });

    let code = response.text || '';

    // Cleanup: Remove markdown backticks if the model ignores the instruction
    if (code.startsWith('```html')) {
      code = code.replace(/^```html/, '').replace(/```$/, '');
    } else if (code.startsWith('```')) {
      code = code.replace(/^```/, '').replace(/```$/, '');
    }

    return code.trim();
  } catch (error) {
    console.error("Gemini Game Generation Error:", error);
    throw new Error("Failed to generate game. Please try again.");
  }
};

/**
 * Handles the conversational aspect of the app.
 * Uses 'gemini-2.5-flash' for low latency responses.
 * 
 * @param {Array} history - Conversation history from memory.json with format [{role: 'user'|'assistant', text: string}]
 * @param {string} newMessage - The new user message to send
 * @returns {Promise<string>} - The AI response text
 */
const sendChatMessage = async (history, newMessage) => {
  try {
    // Convert memory.json format to Gemini SDK format
    // memory.json uses: { role: 'user'|'assistant', text: string }
    // Gemini SDK uses: { role: 'user'|'model', parts: [{ text: string }] }
    const chatHistory = history
      .filter(msg => msg.role !== 'system')
      .map(msg => ({
        role: msg.role === 'assistant' ? 'model' : msg.role,
        parts: [{ text: msg.text }]
      }));

    const chat = ai.chats.create({
      model: 'gemini-2.5-flash',
      history: chatHistory,
      config: {
        systemInstruction: CHAT_SYSTEM_INSTRUCTION,
      }
    });

    const result = await chat.sendMessage({ message: newMessage });
    return result.text || "I'm not sure what to say.";
  } catch (error) {
    console.error("Gemini Chat Error:", error);
    throw new Error("Failed to send message.");
  }
};

module.exports = {
  generateGameCode,
  sendChatMessage
};
