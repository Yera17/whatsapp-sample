const { GoogleGenAI } = require("@google/genai");

// Initialize the SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_KEY });

const SYSTEM_INSTRUCTION = `
You are an expert game developer and creative coder named "ChatJam".
Your goal is to create simple, fun, and interactive single-file HTML5 games based on user requests.

**Context & Persona:**
- You are popular in a network that includes Dutch students from "Het Amsterdamsche Studenten Corps (ASC)", specifically the disput "Aegis".
- If the user speaks Dutch or mentions "Aegis", "Vo", "Dispuut", or "Ontgroening", use appropriate student slang and themes (beer, tradition, fraternity rivalry).
- If creating games for groups, incentivize "Multiplayer" mechanics (e.g., "Pass the phone", "Tap fastest", or "Sync start").
- **SHOPPING & BRANDS**: You can now create "Branded Games" for e-commerce. (e.g., "Nike Sneaker Creator", "IKEA Furniture Tetris", "Bol.com Package Catch"). These should be simple but highlight a brand or product discovery mechanic.

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

/**
 * Send a message to Gemini with full support for:
 * - Conversation history
 * - Image attachments
 * - Game code context (for remixing)
 * 
 * @param {string} prompt - The user's message
 * @param {Array} history - Conversation history with format [{role: 'user'|'model', parts: [{text: string}]}]
 * @param {string} [imageUrl] - Optional URL of an attached image
 * @param {string} [contextGameCode] - Optional game code for remix/modify requests
 * @returns {Promise<{text: string, game?: Object}>}
 */
const sendMessageToGemini = async (prompt, history = [], imageUrl = null, contextGameCode = null) => {
  try {
    const modelId = "gemini-2.5-pro";

    // Transform history for the API
    const formattedHistory = history.map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: h.parts
    }));

    const currentParts = [];

    // Handle Image Attachment
    if (imageUrl) {
      try {
        const imageResp = await fetch(imageUrl);
        const imageBuffer = await imageResp.arrayBuffer();
        const base64String = Buffer.from(imageBuffer).toString('base64');
        const mimeType = imageResp.headers.get('content-type') || 'image/jpeg';

        // 1. Add image for multimodal understanding
        currentParts.push({
          inlineData: {
            data: base64String,
            mimeType: mimeType
          }
        });

        // 2. Add system note so the coder knows the URL to use in the HTML
        currentParts.push({
          text: `[System Note: The user attached an image available at URL: "${imageUrl}". If the user asks to use this image in the game, you can embed it using this URL in an <img> tag or as a background.]`
        });

      } catch (e) {
        console.error("Failed to process attached image", e);
      }
    }

    // Handle Remix Context
    if (contextGameCode) {
      currentParts.push({
        text: `[System Note: The user wants to REMIX or MODIFY an existing game. Here is the source code of the game they are referring to. Use this as the base for your new code generation:\n\n${contextGameCode}\n\n]`
      });
    }

    // Add text prompt
    if (prompt) {
      currentParts.push({ text: prompt });
    } else if (!imageUrl && !contextGameCode) {
      // Fallback if empty
      currentParts.push({ text: "..." });
    }

    const response = await ai.models.generateContent({
      model: modelId,
      contents: [
        ...formattedHistory,
        { role: 'user', parts: currentParts }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
        maxOutputTokens: 20000,
      }
    });

    let responseText = response.text || "";

    // CLEANUP: Strip out "Thinking Process" if it leaked
    // This regex matches "Thinking Process:" or similar headers, and removes everything until a double newline followed by normal text or JSON
    responseText = responseText.replace(/^(?:\s*[\*_]*Thinking Process[\*_]*:|Thinking:|Analysis:).*?(\n\n(?![0-9])|(?=Here is|Sure|Okay|Here's))/s, "").trim();
    // Fallback simple cleaner for standard leaks
    responseText = responseText.replace(/Thinking Process:[\s\S]*?\n\n/gi, "").trim();

    // --- ROBUST PARSING LOGIC START ---
    let jsonString = null;
    let cleanText = responseText;

    // Attempt 1: Standard Markdown Code Block (```json ... ```)
    const backtickMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (backtickMatch) {
      jsonString = backtickMatch[1];
      cleanText = responseText.replace(backtickMatch[0], "").trim();
    } else {
      // Attempt 2: Triple Single Quotes ('''json ... ''') - Handling the reported bug
      const quoteMatch = responseText.match(/'''(?:json)?\s*([\s\S]*?)\s*'''/i);
      if (quoteMatch) {
        jsonString = quoteMatch[1];
        cleanText = responseText.replace(quoteMatch[0], "").trim();
      } else {
        // Attempt 3: Look for raw JSON object if it starts and ends with brackets and contains "code"
        // This captures cases where the model forgets markdown entirely but sends valid JSON
        const openBrace = responseText.indexOf('{');
        const closeBrace = responseText.lastIndexOf('}');
        if (openBrace !== -1 && closeBrace !== -1 && closeBrace > openBrace) {
          const potentialJson = responseText.substring(openBrace, closeBrace + 1);
          // Heuristic check to ensure it's likely our game JSON
          if (potentialJson.includes('"code"') && potentialJson.includes('"title"')) {
            jsonString = potentialJson;
            cleanText = responseText.replace(potentialJson, "").trim();
          }
        }
      }
    }

    if (jsonString) {
      try {
        const gameData = JSON.parse(jsonString);
        return {
          text: cleanText || "Game ready! 🎮 Do you want to publish this to the network so others can play?",
          game: {
            title: gameData.title,
            previewDescription: gameData.description,
            code: gameData.code,
            isMultiplayer: gameData.isMultiplayer || false,
            plays: 0,
            isPublic: false
          }
        };
      } catch (e) {
        console.error("Failed to parse game JSON", e);
        // Fallback: If parsing fails but we found a block, we still return text.
        return { text: responseText };
      }
    }
    // --- ROBUST PARSING LOGIC END ---

    return { text: responseText };

  } catch (error) {
    console.error("Gemini API Error:", error);
    return { text: "Sorry, I encountered an error while processing your request." };
  }
};

/**
 * Transcribe audio using Gemini's multimodal capabilities
 * 
 * @param {string} base64Audio - Base64 encoded audio data
 * @param {string} mimeType - MIME type of the audio (e.g., 'audio/webm', 'audio/ogg')
 * @returns {Promise<string>} - Transcribed text
 */
const transcribeAudio = async (base64Audio, mimeType) => {
  try {
    const modelId = "gemini-2.5-flash";

    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Audio } },
          { text: "Transcribe this audio exactly." }
        ]
      }
    });

    return response.text || "";
  } catch (error) {
    console.error("Transcription Error:", error);
    return "";
  }
};

/**
 * Simple wrapper for generating a game from a single prompt (backward compatible)
 * 
 * @param {string} userPrompt - The game description
 * @returns {Promise<string>} - The generated HTML game code
 */
const generateGameCode = async (userPrompt) => {
  const result = await sendMessageToGemini(
    `Create a complete HTML5 game based on this description: "${userPrompt}"`
  );
  
  if (result.game && result.game.code) {
    return result.game.code;
  }
  
  // Fallback: return raw text if no game was parsed
  let code = result.text || '';
  
  // Cleanup: Remove markdown backticks if present
  if (code.startsWith('```html')) {
    code = code.replace(/^```html/, '').replace(/```$/, '');
  } else if (code.startsWith('```')) {
    code = code.replace(/^```/, '').replace(/```$/, '');
  }
  
  return code.trim();
};

module.exports = {
  sendMessageToGemini,
  transcribeAudio,
  generateGameCode
};
