/**
 * GeminiService вЂ” AI integration layer for Re:new.
 * Communicates with Google Gemini API via REST.
 * Returns structured data to State Manager; never touches UI directly.
 */

import { isValidCategory, CATEGORY_Z_INDEX } from '../models/garment.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

/** Valid categories for garment classification */
const VALID_CATEGORIES = Object.keys(CATEGORY_Z_INDEX);

/**
 * @typedef {{ success: true, data: any } | { success: false, error: string }} ServiceResult
 */

/**
 * @typedef {{ role: 'user' | 'model', text: string }} ChatMessage
 */

export class GeminiService {
  /** @param {string} apiKey */
  constructor(apiKey) {
    if (!apiKey) throw new Error('GeminiService requires an API key');
    this.apiKey = apiKey;
    this.endpoint = `${GEMINI_API_BASE}?key=${apiKey}`;
  }

  /**
   * Analyzes a text description of a garment and returns structured data.
   * Used by Wardrobe "Smart Add" feature.
   * @param {string} description вЂ” e.g. "Р‘РµР¶РµРІС‹Рµ С€РёСЂРѕРєРёРµ Р±СЂСЋРєРё"
   * @returns {Promise<ServiceResult>}
   */
  async analyzeGarmentText(description) {
    const systemPrompt = `You are a fashion AI assistant for a smart wardrobe app called Re:new.
The user will describe a clothing item in any language. Your task is to analyze it and return a STRICT JSON object.

RULES:
- "name" вЂ” a short English name for the item (2-4 words)
- "category" вЂ” MUST be one of: ${VALID_CATEGORIES.join(', ')}
- "color" вЂ” the most fitting HEX color code (e.g. "#C4A882")
- "zIndex" вЂ” derived from category: base=0, pants=1, shirt=1, shoes=1, sweater=2, outerwear=3, accessory=4
- "styleTags" вЂ” array of 2-4 style tags (e.g. ["smart casual", "y2k", "minimalist"])

Return ONLY the JSON object, no markdown, no explanations.

Example output:
{"name": "Beige Wide Pants", "category": "pants", "color": "#C4A882", "zIndex": 1, "styleTags": ["smart casual", "y2k"]}`;

    try {
      const response = await this._callGemini(systemPrompt, description);
      if (!response.success) return response;

      const text = this._extractText(response.data);
      const parsed = this._extractJSON(text);

      if (!parsed) {
        return { success: false, error: 'AI returned invalid JSON. Please try again.' };
      }

      // Validate category
      const category = parsed.category?.toLowerCase();
      if (!isValidCategory(category)) {
        return { success: false, error: `Invalid category "${parsed.category}". Must be one of: ${VALID_CATEGORIES.join(', ')}` };
      }
      parsed.category = category;

      // Ensure zIndex matches category
      parsed.zIndex = CATEGORY_Z_INDEX[/** @type {import('../models/garment.js').GarmentCategory} */ (category)];

      return { success: true, data: parsed };
    } catch (err) {
      return { success: false, error: /** @type {Error} */ (err).message || 'Garment analysis failed' };
    }
  }

  /**
   * Generates an outfit from the user's wardrobe based on weather.
   * @param {string} weatherDescription вЂ” e.g. "0В°C, Sunny"
   * @param {Array<{id: string, name: string, category: string, color?: string}>} wardrobe
   * @returns {Promise<ServiceResult>}
   */
  async generateOutfit(weatherDescription, wardrobe) {
    if (!wardrobe || wardrobe.length === 0) {
      return { success: false, error: 'Wardrobe is empty. Add items first.' };
    }

    const wardrobeJSON = JSON.stringify(wardrobe.map(g => ({
      id: g.id, name: g.name, category: g.category, color: g.color,
    })));

    const systemPrompt = `You are a fashion AI stylist for the Re:new smart wardrobe app.
Given the current weather and the user's wardrobe, select the best outfit combination.

RULES:
- Select items ONLY from the provided wardrobe (use their exact IDs)
- An outfit should typically include: shirt/sweater + pants + shoes
- For cold weather (below 10В°C), add outerwear
- For very cold weather (below 0В°C), add sweater + outerwear
- You may add 1-2 accessories if they complement the look
- Give the outfit a stylish name (e.g. "Smart Casual", "Urban Chic", "Cozy Winter")
- Return ONLY a JSON object

JSON format:
{"selectedIds": ["id1", "id2", ...], "styleName": "Style Name"}`;

    const userMessage = `Weather: ${weatherDescription}\n\nMy wardrobe:\n${wardrobeJSON}`;

    try {
      const response = await this._callGemini(systemPrompt, userMessage);
      if (!response.success) return response;

      const text = this._extractText(response.data);
      const parsed = this._extractJSON(text);

      if (!parsed || !Array.isArray(parsed.selectedIds)) {
        return { success: false, error: 'AI returned invalid outfit data.' };
      }

      return { success: true, data: parsed };
    } catch (err) {
      return { success: false, error: /** @type {Error} */ (err).message || 'Outfit generation failed' };
    }
  }

  /**
   * Chat with AI stylist. Wardrobe context is always injected.
   * @param {string} userMessage
   * @param {Array<{id: string, name: string, category: string, color?: string}>} wardrobe
   * @param {ChatMessage[]} history
   * @returns {Promise<ServiceResult>}
   */
  async chat(userMessage, wardrobe, history) {
    const wardrobeSummary = wardrobe.length > 0
      ? wardrobe.map(g => `- ${g.name} (${g.category}, ${g.color || 'no color'})`).join('\n')
      : 'The wardrobe is currently empty.';

    const systemPrompt = `You are Re:new AI Stylist вЂ” a personal fashion consultant inside a smart wardrobe app.
You speak in a friendly, professional tone. You know fashion trends, color theory, and style combinations.

THE USER'S CURRENT WARDROBE:
${wardrobeSummary}

RULES:
- Always reference specific items from the user's wardrobe when giving advice
- If the user asks what to wear, suggest combinations from THEIR wardrobe
- Be concise but helpful (2-4 sentences max)
- If asked about items not in the wardrobe, suggest what to add
- Respond in the same language the user writes in`;

    try {
      /** @type {Array<{role: string, parts: Array<{text: string}>}>} */
      const contents = [];

      // Add history
      for (const msg of history) {
        contents.push({
          role: msg.role === 'model' ? 'model' : 'user',
          parts: [{ text: msg.text }],
        });
      }

      // Add current message
      contents.push({
        role: 'user',
        parts: [{ text: userMessage }],
      });

      const body = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
      };

      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        return { success: false, error: `API error (${res.status}): ${errText}` };
      }

      const data = await res.json();
      const text = this._extractText(data);

      return { success: true, data: { message: text } };
    } catch (err) {
      return { success: false, error: /** @type {Error} */ (err).message || 'Chat request failed' };
    }
  }

  /**
   * Makes a Gemini API call with system instruction + user message.
   * @param {string} systemPrompt
   * @param {string} userMessage
   * @returns {Promise<ServiceResult>}
   */
  async _callGemini(systemPrompt, userMessage) {
    const body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    };

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `API error (${res.status}): ${errText}` };
    }

    const data = await res.json();
    return { success: true, data };
  }

  /**
   * Extracts text content from Gemini response structure.
   * @param {any} data
   * @returns {string}
   */
  _extractText(data) {
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  /**
   * Extracts JSON from text that may contain markdown code fences.
   * @param {string} text
   * @returns {any | null}
   */
  _extractJSON(text) {
    if (!text) return null;

    // Try to extract from markdown code block
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : text.trim();

    try {
      return JSON.parse(jsonStr);
    } catch {
      // Try to find JSON object in the text
      const objMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (objMatch) {
        try {
          return JSON.parse(objMatch[0]);
        } catch {
          return null;
        }
      }
      return null;
    }
  }
}
