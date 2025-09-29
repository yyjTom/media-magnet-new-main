import express from 'express';
import axios from 'axios';

const router = express.Router();

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const TARGET_JOURNALIST_COUNT = 10;

// ---------- Shared prompt builders ----------
const buildPrompt = ({
  companyName,
  companyDescription,
  website,
}: { companyName: string; companyDescription: string; website: string }) => {
  const subject = website && website.trim().length > 0
    ? `${website} (If this is URL, visit its website to gain understanding)`
    : `${companyName || 'The company'} — ${companyDescription}`;

  return `${subject} need to be covered by premier journalists in different media. Find and search ${TARGET_JOURNALIST_COUNT} different journalists who have covered a product like this, and record the media outlet name, and link to the article. Give each one a relevance score between 1 - 100. Search for their email, LinkedIn address, and X handle.

Return the data as strict JSON with a top-level "journalists" array of exactly ${TARGET_JOURNALIST_COUNT} entries. Each entry MUST use these exact keys (snake_case where shown) and null when unavailable, and include absolute URLs:
{
  "name": string,
  "outlet": string,
  "article_link": string,
  "beat": string | null,
  "relevance_score": number,
  "email": string | null,
  "linkedin": string | null,
  "x_handle": string | null
}

Only return the JSON. No extra commentary.`;
};

const buildOutreachPrompt = ({
  journalist,
  companyName,
  companyDescription,
  website,
}: {
  journalist: any;
  companyName: string;
  companyDescription: string;
  website: string;
}) => {
  const handleSummary = [
    journalist?.twitter ? `X handle: ${journalist.twitter}` : null,
    journalist?.instagram ? `Instagram handle: ${journalist.instagram}` : null,
    journalist?.linkedIn ? `LinkedIn profile: ${journalist.linkedIn}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const sourceSummary = (journalist?.sources ?? [])
    .map((source: any, index: number) => `${index + 1}. ${source.description} (${source.url})`)
    .join('\n');

  return `Draft a personalised outreach plan for journalist ${journalist.name} at ${journalist.parentMediaOrganization}. The startup is ${companyName} (${website}) with this description: ${companyDescription}.

Important context about the journalist:
- Recent coverage summary: ${journalist.coverageSummary}
- Article link: ${journalist.coverageLink}
${handleSummary ? `- Handles:\n${handleSummary}` : ''}
${sourceSummary ? `- Additional sources:\n${sourceSummary}` : ''}

Your objectives:
- Analyze the founder’s experience and their product, craft unique and extremely coverage angles tailored for this journalist.
- Be personalised in the messaging, be extremely concise, and hook the journalist with the first sentence.
- Demonstrate you have read a previous article they covered with similar or related topics.
- Pitch an angle to cover the story.
- Pitch the story by offering an exclusive interview or exclusive angle to be reported.
- Tailor many messages: email cold reach, X direct message, X public post (@their user handles directly), LinkedIn direct message, LinkedIn public post (@their user handles directly).
- Do not use any em dashes or arrows in the responses.

Return the result as JSON with this exact shape:
{
  "email": string,
  "xDirectMessage": string,
  "xPublicPost": string,
  "linkedInDirectMessage": string,
  "linkedInPublicPost": string
}

Ensure each value is a single concise message for the specified channel, ready to send.`;
};

// Helper function for Gemini requests with timeout and retry
async function callGemini(messages: any[], maxRetries = 2): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY not found in environment variables');
    console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('GEMINI')));
    throw new Error('Gemini API key not configured');
  }
  
  console.log('✅ Using Gemini API key:', apiKey.substring(0, 7) + '...' + apiKey.substring(apiKey.length - 4));

  let lastError: any;
  
  let timeoutId: NodeJS.Timeout;
  let progressInterval: NodeJS.Timeout;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Gemini request attempt ${attempt + 1}/${maxRetries + 1}`);
      
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes timeout
      
      // Add progress logging
      progressInterval = setInterval(() => {
        console.log('⏳ Gemini request still processing... (this is normal for complex requests)');
      }, 30000); // Log every 30 seconds
      
      // Convert messages to Gemini format
      const prompt = messages.map(msg => msg.content).join('\n\n');
      const geminiBody = {
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 8192,
        }
      };
      
      // Use axios with better timeout control
      const response = await axios.post(`${GEMINI_ENDPOINT}?key=${apiKey}`, geminiBody, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Node.js/Gemini-Client',
        },
        timeout: 120000, // 2 minutes timeout
        signal: controller.signal,
        // Additional axios configuration for better connectivity
        maxRedirects: 5,
        validateStatus: (status) => status < 500, // Don't throw on 4xx errors
      });
      
      clearTimeout(timeoutId);
      clearInterval(progressInterval);
      
      if (response.status >= 400) {
        throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${JSON.stringify(response.data)}`);
      }
      
      // Convert Gemini response to OpenAI-like format for compatibility
      const geminiResponse = response.data;
      if (geminiResponse.candidates && geminiResponse.candidates[0] && geminiResponse.candidates[0].content) {
        return {
          choices: [{
            message: {
              content: geminiResponse.candidates[0].content.parts[0].text
            }
          }]
        };
      } else {
        throw new Error('Invalid Gemini response format');
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      clearInterval(progressInterval);
      lastError = error;
      console.error(`Gemini request attempt ${attempt + 1} failed:`, error.message);
      
      // If it's the last attempt or a non-retryable error, throw
      if (attempt === maxRetries || (error.name !== 'AbortError' && !error.message.includes('timeout') && !error.message.includes('ECONNRESET') && !error.message.includes('ENOTFOUND'))) {
        throw error;
      }
      
      // Wait before retry (exponential backoff)
      const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
      console.log(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// ---------- Journalists generation ----------
router.post('/journalists', async (req, res) => {
  const requestStartTime = Date.now();
  console.log('🚀 Journalists generation request received at:', new Date().toISOString());
  
  try {
    const { website = '', companyName = 'Your Company', companyDescription = 'A high-growth technology startup building innovative products.' } = (req.body || {}) as {
      website?: string;
      companyName?: string;
      companyDescription?: string;
    };

    console.log('Generating journalists for:', { website, companyName });

    const payload = await callGemini([
      {
        role: 'system',
        content: 'You are a meticulous media researcher who only responds with valid JSON and never includes commentary outside of the JSON object.',
      },
      {
        role: 'user',
        content: buildPrompt({ website, companyName, companyDescription }),
      },
    ]);

    const rawContent = payload?.choices?.[0]?.message?.content;
    if (typeof rawContent !== 'string') {
      return res.status(500).json({ error: 'Unexpected Gemini response format' });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawContent);
    } catch (e) {
      console.error('Failed to parse Gemini JSON:', rawContent);
      return res.status(500).json({ error: 'Failed to parse Gemini JSON response' });
    }

    // Map the simplified schema to the app's expected schema for compatibility
    const mapItem = (item: any) => {
      const name = item?.name ?? '';
      const outlet = item?.outlet ?? item?.media ?? item?.parentMediaOrganization ?? '';
      const articleLink = item?.article_link ?? item?.['article link'] ?? item?.coverageLink ?? '';
      const beat = item?.beat ?? '';
      const relevanceRaw = item?.relevance_score ?? item?.['relevance score'] ?? item?.relevanceScore ?? 0;
      const relevanceScore = Number.isFinite(Number(relevanceRaw)) ? Math.max(1, Math.min(100, Math.round(Number(relevanceRaw)))) : 0;
      const email = item?.email ?? null;
      const linkedIn = item?.linkedin ?? item?.linkedIn ?? null;
      const twitter = item?.x_handle ?? item?.twitter ?? null;
      const coverageLink = typeof articleLink === 'string' ? articleLink : '';

      return {
        name,
        parentMediaOrganization: outlet,
        coverageSummary: beat ? `Beat: ${beat}` : '',
        coverageLink,
        email,
        linkedIn,
        twitter,
        instagram: null,
        relevanceScore,
        sources: coverageLink ? [{ description: 'article', url: coverageLink }] : []
      };
    };

    const journalists = Array.isArray(parsed?.journalists) ? parsed.journalists.map(mapItem) : [];
    const totalTime = Date.now() - requestStartTime;
    console.log(`✅ Generated ${journalists.length} journalists in ${totalTime}ms`);
    return res.json({ journalists });
  } catch (error: any) {
    const totalTime = Date.now() - requestStartTime;
    console.error(`❌ Generate journalists failed after ${totalTime}ms:`, error);
    
    // Provide more specific error messages
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      return res.status(504).json({ 
        error: 'Request timeout - Gemini API is taking too long to respond. Please try again.',
        code: 'GEMINI_TIMEOUT',
        duration: `${totalTime}ms`
      });
    }
    
    if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      return res.status(503).json({ 
        error: 'Unable to connect to Gemini API. Please check your network connection.',
        code: 'GEMINI_CONNECTION_ERROR'
      });
    }
    
    return res.status(500).json({ 
      error: 'Failed to generate journalists. Please try again.',
      code: 'GEMINI_ERROR',
      detail: error.message
    });
  }
});

// ---------- Outreach generation ----------
router.post('/outreach', async (req, res) => {
  try {
    const { journalist, companyName, companyDescription, website } = (req.body || {}) as {
      journalist: any;
      companyName: string;
      companyDescription: string;
      website: string;
    };

    if (!journalist || !companyName || !companyDescription || !website) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log('Generating outreach for:', { journalistName: journalist?.name, companyName });

    const payload = await callGemini([
      {
        role: 'system',
        content: 'You are a concise PR copywriter who only responds with valid JSON matching the requested schema.',
      },
      {
        role: 'user',
        content: buildOutreachPrompt({ journalist, companyName, companyDescription, website }),
      },
    ]);

    const rawContent = payload?.choices?.[0]?.message?.content;
    if (typeof rawContent !== 'string') {
      return res.status(500).json({ error: 'Unexpected Gemini response format' });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawContent);
    } catch (e) {
      console.error('Failed to parse Gemini JSON:', rawContent);
      return res.status(500).json({ error: 'Failed to parse Gemini JSON response' });
    }

    console.log('Generated outreach messages for:', journalist?.name);
    return res.json({ outreach: parsed });
  } catch (error: any) {
    console.error('Generate outreach failed:', error);
    
    // Provide more specific error messages
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      return res.status(504).json({ 
        error: 'Request timeout - OpenAI API is taking too long to respond. Please try again.',
        code: 'OPENAI_TIMEOUT'
      });
    }
    
    if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      return res.status(503).json({ 
        error: 'Unable to connect to Gemini API. Please check your network connection.',
        code: 'GEMINI_CONNECTION_ERROR'
      });
    }
    
    return res.status(500).json({ 
      error: 'Failed to generate outreach messages. Please try again.',
      code: 'GEMINI_ERROR',
      detail: error.message
    });
  }
});

// Debug endpoint to test Gemini connectivity
router.get('/test-gemini', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'Gemini API key not configured',
        envVars: Object.keys(process.env).filter(k => k.includes('GEMINI'))
      });
    }

    console.log('🧪 Testing Gemini connectivity...');
    const startTime = Date.now();
    
    try {
      const testBody = {
        contents: [{
          parts: [{ text: 'Hello, respond with "OK" if you can hear me.' }]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 10,
        }
      };

      const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Node.js'
        },
        body: JSON.stringify(testBody),
        signal: AbortSignal.timeout(60000) // 60s timeout for test
      });
      
      const duration = Date.now() - startTime;
      
      if (response.ok) {
        const data = await response.json();
        return res.json({
          success: true,
          duration: `${duration}ms`,
          response: data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response',
          apiKeyPrefix: apiKey.substring(0, 7) + '...'
        });
      } else {
        return res.status(response.status).json({
          error: 'Gemini API error',
          status: response.status,
          statusText: response.statusText,
          duration: `${duration}ms`
        });
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('Gemini connectivity test failed:', error);
      
      // More detailed error information
      let errorDetails: any = {
        error: error.message || 'Unknown error',
        type: error.constructor.name,
        code: error.code,
        duration: `${duration}ms`,
      };
      
      // Add specific error details
      if (error.cause) {
        errorDetails.cause = error.cause.message || error.cause;
      }
      
      if (error.code === 'ENOTFOUND') {
        errorDetails.suggestion = 'DNS resolution failed. Check internet connection or DNS settings.';
      } else if (error.code === 'ECONNREFUSED') {
        errorDetails.suggestion = 'Connection refused. Check if Gemini API is accessible.';
      } else if (error.code === 'ETIMEDOUT' || error.name === 'AbortError') {
        errorDetails.suggestion = 'Request timeout. Check network speed or try again.';
      }
      
      return res.status(500).json(errorDetails);
    }
  } catch (error: any) {
    console.error('Gemini connectivity test failed:', error);
    return res.status(500).json({
      error: error.message,
      type: error.constructor.name,
      code: error.code
    });
  }
});

export default router;


