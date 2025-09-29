import express from 'express';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

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

  return `${subject} need to be covered by premier journalists in different media. Find and search 10 different journalists who have covered a product like this, and record the media outlet name, and link to the article. Give each one a relevance score between 1 - 100. Search for their email, LinkedIn address, and X handle.

Return the data as strict JSON with a top-level "journalists" array of exactly ${TARGET_JOURNALIST_COUNT} entries. with header of such order:name, outlet, article link, beat, relevance score, email, linkedin, x_handle`;
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

  return `For the first entry in the above JSON Draft a personalized message to each one of them, by keeping your focus on:

Journalist: ${journalist.name} at ${journalist.parentMediaOrganization}
Company: ${companyName} (${website}) - ${companyDescription}

Important context about the journalist:
- Recent coverage summary: ${journalist.coverageSummary}
- Article link: ${journalist.coverageLink}
${handleSummary ? `- Handles:\n${handleSummary}` : ''}
${sourceSummary ? `- Additional sources:\n${sourceSummary}` : ''}

- Search and analyze the company founder's experience and their product, craft unique and extremely insightful coverage angles tailored for each journalist.
- Be hyper-personalized in the cold outreach for each journalist, be extremely concise, and hook the journalist with the first sentence.
- Demonstrate you have read a previous article they covered before with similar are related topics
- Pitch an unique angle to cover the story
- Must weave in the founder or the companies' unique strength, value proposition, or the connection to the journalists interests .Must tie back to why they want to be reported (not generic "coverage"). Keep it short, punchy, and scrappy. But keep it PROFESSIONAL. Each email must include: subject line, greeting, 3–4 sentence body, and a bold CTA asking to be reported or interviewed. Language must feel direct, confident, and a little cheeky (not stiff like a cover letter).
- Tailor messages, for email cold reach, X DM, X public post (@their user handles directly), and LinkedIn DM message, LinkedIn public post (@their user handles directly). Return the response in plain text

Return the result as JSON with this exact shape:
{
  "email": string,
  "xDirectMessage": string,
  "xPublicPost": string,
  "linkedInDirectMessage": string,
  "linkedInPublicPost": string
}

Ensure each value is a complete message for the specified channel, ready to send.`;
};

// Normalize proxy URL from env to a valid URL string and build agent safely
function getHttpsAgentFromEnv(): HttpsProxyAgent | undefined {
  try {
    const raw = (process.env.GEMINI_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '').trim();
    if (!raw) return undefined;

    let url = raw;
    // If only digits provided, treat as local HTTP proxy port
    if (/^\d+$/.test(url)) {
      url = `http://127.0.0.1:${url}`;
    }
    // If like host:port (no scheme), prefix http
    if (!/^https?:\/\//i.test(url)) {
      url = `http://${url}`;
    }

    return new HttpsProxyAgent(url);
  } catch (e: any) {
    console.error('Invalid proxy configuration, skipping proxy:', e?.message);
    return undefined;
  }
}

// Robust JSON parser for LLM outputs
function parseJsonFromModel(raw: any): any {
  if (typeof raw !== 'string') {
    throw new Error('Model response is not a string');
  }
  let text = raw.trim();
  // Strip Markdown code fences
  if (text.startsWith('```')) {
    // remove opening fence with optional language tag
    text = text.replace(/^```[a-zA-Z]*\s*/i, '');
    // remove closing fence
    text = text.replace(/\s*```\s*$/i, '');
    text = text.trim();
  }
  // First direct parse
  try {
    return JSON.parse(text);
  } catch {}
  // Extract innermost JSON object by braces
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    const candidate = text.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch {}
  }
  throw new Error('Unable to parse JSON payload from model output');
}

function normalizeOutreachModel(input: any) {
  const get = (obj: any, keys: string[]): string => {
    for (const k of keys) {
      const v = obj?.[k];
      if (typeof v === 'string' && v.trim().length > 0) return v.trim();
    }
    return '';
  };

  const email = get(input, ['email']);
  const xDirectMessage = get(input, ['xDirectMessage', 'x_direct_message', 'x_dm', 'twitter_dm']);
  const xPublicPost = get(input, ['xPublicPost', 'x_public_post', 'twitter_public_post']);
  const linkedInDirectMessage = get(input, ['linkedInDirectMessage', 'linkedinDirectMessage', 'linkedin_direct_message']);
  const linkedInPublicPost = get(input, ['linkedInPublicPost', 'linkedinPublicPost', 'linkedin_public_post']);

  return {
    email: email || 'Hi [Name], ...',
    xDirectMessage: xDirectMessage || 'Hi [Name] — quick pitch via DM ...',
    xPublicPost: xPublicPost || 'Sharing a quick note @handle about ...',
    linkedInDirectMessage: linkedInDirectMessage || 'Hi [Name], reaching out regarding ...',
    linkedInPublicPost: linkedInPublicPost || 'Excited to share an update ...',
  };
}

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
      
      // Build optional proxy agent only for external Gemini call
      const httpsAgent = getHttpsAgentFromEnv();

      // Use axios with better timeout control (proxy applied only here)
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
        httpsAgent,
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
      parsed = parseJsonFromModel(rawContent);
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
      parsed = parseJsonFromModel(rawContent);
    } catch (e) {
      console.error('Failed to parse Gemini JSON:', rawContent);
      return res.status(500).json({ error: 'Failed to parse Gemini JSON response' });
    }

    // Normalize outreach keys to match frontend expectations
    const normalizedOutreach = normalizeOutreachModel(parsed);

    console.log('Generated outreach messages for:', journalist?.name);
    return res.json({ outreach: normalizedOutreach });
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

      const httpsAgent = getHttpsAgentFromEnv();

      const response = await axios.post(`${GEMINI_ENDPOINT}?key=${apiKey}`, testBody, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Node.js/Gemini-Client'
        },
        timeout: 60000,
        maxRedirects: 5,
        validateStatus: (status) => status < 500,
        httpsAgent,
      });
      
      const duration = Date.now() - startTime;
      
      if (response.status < 400) {
        const data = response.data;
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
          data: response.data,
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


