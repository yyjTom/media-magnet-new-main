import express from 'express';
import axios from 'axios';

const router = express.Router();

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o-mini';
const TARGET_JOURNALIST_COUNT = 20;

// ---------- Shared prompt builders ----------
const buildPrompt = ({
  companyName,
  companyDescription,
  website,
}: { companyName: string; companyDescription: string; website: string }) => `You are an expert at finding PR leads for tech startups. You are provided with [Customer company name], [company description], and [URL] which needs media outreach. If you have the URL, go to the front page and analyze what they do. They need to be covered by premier journalists in prominent media such as WSJ, Forbes, New York Times, TechCrunch, BusinessInsider, Washington Post, Bloomberg, The Verge etc. Do not limit yourself with the outlets above, and suggest the most fitting outlet based on their website or content. Find and search ${TARGET_JOURNALIST_COUNT} different journalists who have covered a product like the one specified in the URL. If the URL is not descriptive enough, use the company description text instead. Search for the journalist's email, their LinkedIn address, their X handle, and their instagram.

While doing the search, indicate your sources, and the relevance score.

Return the data as JSON with a top-level "journalists" array of exactly ${TARGET_JOURNALIST_COUNT} entries. Each entry MUST match the following schema and use null when data is unavailable:
{
  "name": string,
  "parentMediaOrganization": string,
  "coverageSummary": string,
  "coverageLink": string (absolute URL),
  "email": string | null,
  "linkedIn": string | null,
  "twitter": string | null,
  "instagram": string | null,
  "relevanceScore": number (0-100),
  "sources": [
    { "description": string, "url": string (absolute URL) }
  ]
}

Customer company name: ${companyName}
Company description: ${companyDescription}
URL: ${website}

Ensure that: (1) at least one source with a working link is provided per journalist, (2) relevanceScore is a whole number between 0 and 100, and (3) coverageSummary references the linked article. Do not include any extra commentary outside of the JSON.`;

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

// Helper function for OpenAI requests with timeout and retry
async function callOpenAI(body: any, maxRetries = 2): Promise<any> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY not found in environment variables');
    console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('OPENAI')));
    throw new Error('OpenAI API key not configured');
  }
  
  console.log('✅ Using OpenAI API key:', apiKey.substring(0, 7) + '...' + apiKey.substring(apiKey.length - 4));

  let lastError: any;
  
  let timeoutId: NodeJS.Timeout;
  let progressInterval: NodeJS.Timeout;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`OpenAI request attempt ${attempt + 1}/${maxRetries + 1}`);
      
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes timeout
      
      // Add progress logging
      progressInterval = setInterval(() => {
        console.log('⏳ OpenAI request still processing... (this is normal for complex requests)');
      }, 30000); // Log every 30 seconds
      
      // Use axios with better timeout control
      const response = await axios.post(OPENAI_ENDPOINT, body, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'User-Agent': 'Node.js/OpenAI-Client',
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
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${JSON.stringify(response.data)}`);
      }
      
      return response.data;
    } catch (error: any) {
      clearTimeout(timeoutId);
      clearInterval(progressInterval);
      lastError = error;
      console.error(`OpenAI request attempt ${attempt + 1} failed:`, error.message);
      
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

    const payload = await callOpenAI({
      model: OPENAI_MODEL,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a meticulous media researcher who only responds with valid JSON and never includes commentary outside of the JSON object.',
        },
        {
          role: 'user',
          content: buildPrompt({ website, companyName, companyDescription }),
        },
      ],
    });

    const rawContent = payload?.choices?.[0]?.message?.content;
    if (typeof rawContent !== 'string') {
      return res.status(500).json({ error: 'Unexpected OpenAI response format' });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawContent);
    } catch (e) {
      console.error('Failed to parse OpenAI JSON:', rawContent);
      return res.status(500).json({ error: 'Failed to parse OpenAI JSON response' });
    }

    const journalists = Array.isArray(parsed?.journalists) ? parsed.journalists : [];
    const totalTime = Date.now() - requestStartTime;
    console.log(`✅ Generated ${journalists.length} journalists in ${totalTime}ms`);
    return res.json({ journalists });
  } catch (error: any) {
    const totalTime = Date.now() - requestStartTime;
    console.error(`❌ Generate journalists failed after ${totalTime}ms:`, error);
    
    // Provide more specific error messages
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      return res.status(504).json({ 
        error: 'Request timeout - OpenAI API is taking too long to respond. Please try again.',
        code: 'OPENAI_TIMEOUT',
        duration: `${totalTime}ms`
      });
    }
    
    if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      return res.status(503).json({ 
        error: 'Unable to connect to OpenAI API. Please check your network connection.',
        code: 'OPENAI_CONNECTION_ERROR'
      });
    }
    
    return res.status(500).json({ 
      error: 'Failed to generate journalists. Please try again.',
      code: 'OPENAI_ERROR',
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

    const payload = await callOpenAI({
      model: OPENAI_MODEL,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a concise PR copywriter who only responds with valid JSON matching the requested schema.',
        },
        {
          role: 'user',
          content: buildOutreachPrompt({ journalist, companyName, companyDescription, website }),
        },
      ],
    });

    const rawContent = payload?.choices?.[0]?.message?.content;
    if (typeof rawContent !== 'string') {
      return res.status(500).json({ error: 'Unexpected OpenAI response format' });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawContent);
    } catch (e) {
      console.error('Failed to parse OpenAI JSON:', rawContent);
      return res.status(500).json({ error: 'Failed to parse OpenAI JSON response' });
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
        error: 'Unable to connect to OpenAI API. Please check your network connection.',
        code: 'OPENAI_CONNECTION_ERROR'
      });
    }
    
    return res.status(500).json({ 
      error: 'Failed to generate outreach messages. Please try again.',
      code: 'OPENAI_ERROR',
      detail: error.message
    });
  }
});

// Debug endpoint to test OpenAI connectivity
router.get('/test-openai', async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'OpenAI API key not configured',
        envVars: Object.keys(process.env).filter(k => k.includes('OPENAI'))
      });
    }

    console.log('🧪 Testing OpenAI connectivity...');
    const startTime = Date.now();
    
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'User-Agent': 'Node.js'
        },
        signal: AbortSignal.timeout(60000) // 60s timeout for test
      });
      
      const duration = Date.now() - startTime;
      
      if (response.ok) {
        const data = await response.json();
        return res.json({
          success: true,
          duration: `${duration}ms`,
          modelsCount: data.data?.length || 0,
          apiKeyPrefix: apiKey.substring(0, 7) + '...'
        });
      } else {
        return res.status(response.status).json({
          error: 'OpenAI API error',
          status: response.status,
          statusText: response.statusText,
          duration: `${duration}ms`
        });
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('OpenAI connectivity test failed:', error);
      
      // More detailed error information
      let errorDetails = {
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
        errorDetails.suggestion = 'Connection refused. Check if OpenAI API is accessible.';
      } else if (error.code === 'ETIMEDOUT' || error.name === 'AbortError') {
        errorDetails.suggestion = 'Request timeout. Check network speed or try again.';
      }
      
      return res.status(500).json(errorDetails);
    }
  } catch (error: any) {
    console.error('OpenAI connectivity test failed:', error);
    return res.status(500).json({
      error: error.message,
      type: error.constructor.name,
      code: error.code
    });
  }
});

export default router;


