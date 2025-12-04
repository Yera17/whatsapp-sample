const { GoogleGenAI } = require("@google/genai");

// Initialize the SDK
// NOTE: In a production environment, never expose API keys on the client side.
// This should technically be proxied through a backend, but for this demo, we use the env var directly.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_KEY });

// System prompt for the Game Generator
const GAME_GENERATOR_SYSTEM_INSTRUCTION = `
You are an expert HTML5 game developer specializing in creating polished, production-quality browser games in a single file.

CRITICAL REQUIREMENTS:
1.  **Single File:** Output MUST be a single, valid HTML file containing CSS (<style>) and JS (<script>).
2.  **Responsive:** Game must work on mobile (touch) and desktop (keyboard/mouse).
3.  **Fullscreen:** Implement a fullscreen toggle button overlay.
4.  **Visuals:** Use HTML5 Canvas. Use modern colors, particle effects, and smooth animations (requestAnimationFrame).
5.  **Controls:** 
    - Desktop: Arrow keys/WASD + Space/Mouse.
    - Mobile: Add on-screen touch controls (D-Pad/Buttons) if needed for the specific game type.
6.  **Robustness:** Handle window resizing.
7.  **No External Assets:** Do not load images/sounds from external URLs (cors issues). Use procedural generation (drawing shapes) or base64 data URIs if absolutely necessary. Use Web Audio API for procedural sound effects.

Output ONLY the raw HTML code. Do not wrap in markdown code blocks like \`\`\`html. Just the code.
`;

const CHAT_SYSTEM_INSTRUCTION = `
You are "Prompt2Play" - a WhatsApp bot that creates HTML5 games instantly.

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
      model: 'gemini-3-pro-preview', // Using Pro model for complex coding tasks
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
