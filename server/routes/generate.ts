import express from 'express';

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

// ---------- Journalists generation ----------
router.post('/journalists', async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Server is not configured for OpenAI', code: 'OPENAI_MISSING_KEY' });
    }

    const { website = '', companyName = 'Your Company', companyDescription = 'A high-growth technology startup building innovative products.' } = (req.body || {}) as {
      website?: string;
      companyName?: string;
      companyDescription?: string;
    };

    const response = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
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
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(500).json({ error: 'OpenAI request failed', detail: errorText });
    }

    const payload = await response.json();
    const rawContent = payload?.choices?.[0]?.message?.content;
    if (typeof rawContent !== 'string') {
      return res.status(500).json({ error: 'Unexpected OpenAI response format' });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawContent);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to parse OpenAI JSON' });
    }

    const journalists = Array.isArray(parsed?.journalists) ? parsed.journalists : [];
    return res.json({ journalists });
  } catch (error) {
    console.error('Generate journalists failed:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ---------- Outreach generation ----------
router.post('/outreach', async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Server is not configured for OpenAI', code: 'OPENAI_MISSING_KEY' });
    }

    const { journalist, companyName, companyDescription, website } = (req.body || {}) as {
      journalist: any;
      companyName: string;
      companyDescription: string;
      website: string;
    };

    if (!journalist || !companyName || !companyDescription || !website) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const response = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
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
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(500).json({ error: 'OpenAI request failed', detail: errorText });
    }

    const payload = await response.json();
    const rawContent = payload?.choices?.[0]?.message?.content;
    if (typeof rawContent !== 'string') {
      return res.status(500).json({ error: 'Unexpected OpenAI response format' });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawContent);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to parse OpenAI JSON' });
    }

    return res.json({ outreach: parsed });
  } catch (error) {
    console.error('Generate outreach failed:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;


