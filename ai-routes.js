const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini API with the configured key
let genAI;
let model;

try {
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY is missing! Please add it to your .env file');
  } else {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // Use gemini-2.0-flash-lite (lighter, less likely to be overloaded)
    model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash-lite",
      generationConfig: {
        temperature: 0.7,
        topP: 1,
        topK: 1,
        maxOutputTokens: 2048,
      }
    });
    console.log('✅ Gemini AI model initialized successfully with gemini-2.0-flash-lite');
  }
} catch (error) {
  console.error('❌ Failed to initialize Gemini AI:', error.message);
}

// ========== RATE LIMITING & RETRY UTILITIES ==========

// Delay utility for retry logic
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Generate content with retry logic and exponential backoff
async function generateWithRetry(prompt, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return result;
    } catch (error) {
      // Check if it's a rate limit error (429)
      if (error.status === 429) {
        if (attempt < maxRetries - 1) {
          // Exponential backoff: 2s, 4s, 8s
          const waitTime = Math.pow(2, attempt + 1) * 1000;
          console.log(`⏳ Rate limited (429). Retrying in ${waitTime/1000}s... (Attempt ${attempt + 1}/${maxRetries})`);
          await delay(waitTime);
        } else {
          // Last attempt failed
          console.error('❌ Max retries reached for rate limit');
          throw {
            status: 429,
            message: 'Too many requests. Please wait a moment and try again.',
            retryAfter: 60
          };
        }
      } else {
        // Different error, throw immediately
        throw error;
      }
    }
  }
}

// ========== MIDDLEWARE ==========

// Ensure API key present
router.use((req, res, next) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ 
      success: false,
      error: 'GEMINI_API_KEY is not configured on the server. Please add it to your .env file.' 
    });
  }
  if (!model) {
    return res.status(500).json({ 
      success: false,
      error: 'AI model failed to initialize. Check your API key.' 
    });
  }
  next();
});

// ========== HELPER FUNCTIONS ==========

// Robust JSON extraction helper
function parseJsonFromText(possibleJson) {
  if (!possibleJson || typeof possibleJson !== 'string') return null;
  let text = possibleJson.trim();

  const fenceMatch = text.match(/```(?:json)?[\r\n]+([\s\S]*?)```/i);
  if (fenceMatch) text = fenceMatch[1].trim();

  try { return JSON.parse(text); } catch (_) {}

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    const candidate = text.slice(start, end + 1);
    try { return JSON.parse(candidate); } catch (_) {}
  }

  return null;
}

// Helper: ask model to return JSON-only response based on schemaHint (with retry)
async function requestStructuredJson(prompt, schemaHint) {
  try {
    const fullPrompt = `${prompt}

You must respond with ONLY a valid JSON object. No markdown, no code blocks, no explanations - just pure JSON.
Required format: ${JSON.stringify(schemaHint, null, 2)}`;

    // Use retry logic here
    const result = await generateWithRetry(fullPrompt);
    const response = await result.response;
    const text = response.text();
    
    console.log('Raw AI response:', text.substring(0, 200));
    
    const parsed = parseJsonFromText(text);
    return { parsed, raw: text };
  } catch (error) {
    console.error('Error in requestStructuredJson:', error);
    throw error;
  }
}

// ========== API ENDPOINTS ==========

// Explain Topic (structured)
router.post('/explain', async (req, res) => {
  try {
    const { topic } = req.body;
    if (!topic) return res.status(400).json({ success: false, error: 'Topic is required' });

    const prompt = `You are an academic assistant. Provide a formal, professional, and structured explanation suitable for university-level study.
- Avoid slang, emojis, and contractions.
- Do not fabricate citations; provide sources only if explicitly given or clearly known.
Explain the topic: ${topic}`;

    const schemaHint = {
      explanation: "string (2-4 paragraphs)",
      keyPoints: ["string", "string", "string"]
    };

    const { parsed, raw } = await requestStructuredJson(prompt, schemaHint);
    if (!parsed || !parsed.explanation) {
      console.error('Failed to parse explanation:', raw);
      return res.status(502).json({ success: false, error: 'Model returned unexpected format', raw });
    }

    return res.json({ success: true, data: parsed });
  } catch (error) {
    console.error('Error in /explain:', error);
    
    // Handle 429 rate limit error
    if (error.status === 429) {
      return res.status(429).json({ 
        success: false, 
        error: error.message || 'Too many requests. Please wait a moment and try again.',
        retryAfter: error.retryAfter || 60
      });
    }
    
    res.status(500).json({ success: false, error: 'Failed to generate explanation', details: error.message });
  }
});

// Create Quiz (strict JSON)
router.post('/quiz', async (req, res) => {
  try {
    const { topic } = req.body;
    if (!topic) return res.status(400).json({ success: false, error: 'Topic is required' });

    const prompt = `You are an academic content generator. Produce a quiz with exactly 5 multiple-choice questions about: ${topic}.
- Tone: formal and professional.
- Return ONLY valid JSON with shape:
{ "questions": [ { "question": "string", "options": ["string","string","string","string"], "correctAnswer": 0 } ] }`;

    // Use retry logic
    const result = await generateWithRetry(prompt);
    const response = await result.response;
    const text = response.text();
    const parsed = parseJsonFromText(text);

    if (!parsed || !Array.isArray(parsed.questions)) {
      console.error('Failed to parse quiz:', text);
      return res.status(502).json({ success: false, error: 'Model returned unexpected quiz format', raw: text });
    }

    return res.json({ success: true, quiz: parsed });
  } catch (error) {
    console.error('Error in /quiz:', error);
    
    // Handle 429 rate limit error
    if (error.status === 429) {
      return res.status(429).json({ 
        success: false, 
        error: error.message || 'Too many requests. Please wait a moment and try again.',
        retryAfter: error.retryAfter || 60
      });
    }
    
    res.status(500).json({ success: false, error: 'Failed to generate quiz', details: error.message });
  }
});

// Summarize Content (structured)
router.post('/summarize', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ success: false, error: 'Content is required' });

    const prompt = `You are an academic summarizer. Summarize the following content formally and concisely for students:
${content}`;

    const schemaHint = {
      briefSummary: "string (1-2 sentences)",
      keyPoints: ["string", "string", "string"],
      implications: ["string (optional)"],
      followUpQuestions: ["string", "string"],
      confidence: "one of: low, medium, high"
    };

    const { parsed, raw } = await requestStructuredJson(prompt, schemaHint);
    if (!parsed || !parsed.briefSummary) {
      console.error('Failed to parse summary:', raw);
      return res.status(502).json({ success: false, error: 'Model returned unexpected summary format', raw });
    }

    return res.json({ success: true, data: parsed });
  } catch (error) {
    console.error('Error in /summarize:', error);
    
    // Handle 429 rate limit error
    if (error.status === 429) {
      return res.status(429).json({ 
        success: false, 
        error: error.message || 'Too many requests. Please wait a moment and try again.',
        retryAfter: error.retryAfter || 60
      });
    }
    
    res.status(500).json({ success: false, error: 'Failed to generate summary', details: error.message });
  }
});

// Unified Chat (returns structured JSON for non-quiz modes; keeps quiz mode behavior)
router.post('/chat', async (req, res) => {
  try {
    const { message, mode } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }

    const selectedMode = (mode || 'explain').toLowerCase();

    if (selectedMode === 'quiz') {
      // Delegate to quiz logic
      const prompt = `You are an academic question author. Create a concise quiz with exactly 5 multiple-choice questions about: ${message}.
Return ONLY valid JSON in this shape:
{ "questions":[ { "question":"...", "options":["...","...","...","..."], "correctAnswer":0 } ] }`;
      
      // Use retry logic
      const result = await generateWithRetry(prompt);
      const response = await result.response;
      const text = response.text();
      const parsed = parseJsonFromText(text);
      
      if (!parsed || !Array.isArray(parsed.questions)) {
        console.error('Failed to parse quiz in chat mode:', text);
        return res.json({ success: false, error: 'The assistant could not format the quiz properly. Please try a different topic.', raw: text });
      }
      return res.json({ success: true, quiz: parsed });
    }

    // For explain/summarize/chat-default produce structured JSON
    const basePrompt = selectedMode === 'summarize'
      ? `You are an academic assistant. Summarize the content formally and concisely for students:\n${message}`
      : `You are an academic instructor. Explain the topic formally and professionally for study:\n${message}`;

    const schemaHint = {
      explanation: "string (2-4 paragraphs)",
      keyPoints: ["string", "string", "string"]
    };

    const { parsed, raw } = await requestStructuredJson(basePrompt, schemaHint);
    if (!parsed || !parsed.explanation) {
      console.error('Failed to parse chat response:', raw);
      return res.status(502).json({ success: false, error: 'Model returned unexpected format', raw });
    }

    return res.json({ success: true, data: parsed });
  } catch (error) {
    console.error('Error in /chat:', error);
    
    // Handle 429 rate limit error
    if (error.status === 429) {
      return res.status(429).json({ 
        success: false, 
        error: error.message || 'Too many requests. Please wait a moment and try again.',
        retryAfter: error.retryAfter || 60
      });
    }
    
    res.status(500).json({ success: false, error: 'Failed to process request', details: error.message });
  }
});

module.exports = router;