const BACKEND_BASE = import.meta.env.PROD ? '' : 'http://localhost:3001';
const TARGET_JOURNALIST_COUNT = 20;

export interface JournalistSource {
  description: string;
  url: string;
}

export interface Journalist {
  name: string;
  parentMediaOrganization: string;
  coverageSummary: string;
  coverageLink: string;
  email: string | null;
  linkedIn: string | null;
  twitter: string | null;
  instagram: string | null;
  relevanceScore: number;
  sources: JournalistSource[];
}

export interface FindJournalistsRequest {
  website?: string;
  companyName?: string;
  companyDescription?: string;
}

export interface FindJournalistsResponse {
  journalists: Journalist[];
}

const defaultCompanyDescription = 'A high-growth technology startup building innovative products.';

export interface OutreachMessages {
  email: string;
  xDirectMessage: string;
  xPublicPost: string;
  linkedInDirectMessage: string;
  linkedInPublicPost: string;
}

export interface GetEmailBodyRequest {
  journalist: Journalist;
  companyName: string;
  companyDescription: string;
  website: string;
}

export interface GetEmailBodyResponse {
  outreach: OutreachMessages;
}

const buildPrompt = ({
  companyName,
  companyDescription,
  website,
}: Required<Pick<FindJournalistsRequest, 'companyName' | 'companyDescription' | 'website'>>) => `You are an expert at finding PR leads for tech startups. You are provided with [Customer company name], [company description], and [URL] which needs media outreach. If you have the URL, go to the front page and analyze what they do. SearcThey need to be covered by premier journalists in prominent media such as WSJ, Forbes, New York Times, TechCrunch, BusinessInsider, Washington Post, Bloomberg, The Verge etc. Do not limit yourself with the outlets above, and suggest the most fitting outlet based on their website or content. Find and search ${TARGET_JOURNALIST_COUNT} different journalists who have covered a product like the one specified in the URL. If the URL is not descriptive enough, use the company description text instead. Search for the journalist's email, their LinkedIn address, their X handle, and their instagram.\n\nWhile doing the search, indicate your sources, and the relevance score.\n\nReturn the data as JSON with a top-level \\"journalists\\" array of exactly ${TARGET_JOURNALIST_COUNT} entries. Each entry MUST match the following schema and use null when data is unavailable:\n{\n \\\"name\\\": string,\n \\\"parentMediaOrganization\\\": string,\n \\\"coverageSummary\\\": string,\n \\\"coverageLink\\\": string (absolute URL),\n \\\"email\\\": string | null,\n \\\"linkedIn\\\": string | null,\n \\\"twitter\\\": string | null,\n \\\"instagram\\\": string | null,\n \\\"relevanceScore\\\": number (0-100),\n \\\"sources\\\": [\n { \\\"description\\\": string, \\\"url\\\": string (absolute URL) }\n ]\n}\n\nCustomer company name: ${companyName}\nCompany description: ${companyDescription}\nURL: ${website}\n\nEnsure that: (1) at least one source with a working link is provided per journalist, (2) relevanceScore is a whole number between 0 and 100, and (3) coverageSummary references the linked article. Do not include any extra commentary outside of the JSON.`;

const buildOutreachPrompt = ({
  journalist,
  companyName,
  companyDescription,
  website,
}: GetEmailBodyRequest) => {
  const handleSummary = [
    journalist.twitter ? `X handle: ${journalist.twitter}` : null,
    journalist.instagram ? `Instagram handle: ${journalist.instagram}` : null,
    journalist.linkedIn ? `LinkedIn profile: ${journalist.linkedIn}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const sourceSummary = (journalist.sources ?? [])
    .map((source, index) => `${index + 1}. ${source.description} (${source.url})`)
    .join('\n');

  return `Draft a personalised outreach plan for journalist ${journalist.name} at ${journalist.parentMediaOrganization}. The startup is ${companyName} (${website}) with this description: ${companyDescription}.\n\nImportant context about the journalist:\n- Recent coverage summary: ${journalist.coverageSummary}\n- Article link: ${journalist.coverageLink}\n${handleSummary ? `- Handles:\n${handleSummary}` : ''}\n${sourceSummary ? `- Additional sources:\n${sourceSummary}` : ''}\n\nYour objectives:\n- Analyze the founder’s experience and their product, craft unique and extremely coverage angles tailored for this journalist.\n- Be personalised in the messaging, be extremely concise, and hook the journalist with the first sentence.\n- Demonstrate you have read a previous article they covered with similar or related topics.\n- Pitch an angle to cover the story.\n- Pitch the story by offering an exclusive interview or exclusive angle to be reported.\n- Tailor many messages: email cold reach, X direct message, X public post (@their user handles directly), LinkedIn direct message, LinkedIn public post (@their user handles directly).\n- Do not use any em dashes or arrows in the responses.\n\nReturn the result as JSON with this exact shape:\n{\n  "email": string,\n  "xDirectMessage": string,\n  "xPublicPost": string,\n  "linkedInDirectMessage": string,\n  "linkedInPublicPost": string\n}\n\nEnsure each value is a single concise message for the specified channel, ready to send.`;
};

export async function findJournalists({
  website,
  companyName,
  companyDescription,
}: FindJournalistsRequest): Promise<FindJournalistsResponse> {

  // Call backend proxy

  const hasWebsite = Boolean(website && website.trim().length > 0);
  const safeWebsite = website?.trim() || '';
  const resolvedCompanyName = companyName?.trim() || (hasWebsite ? inferCompanyNameFromUrl(safeWebsite) : 'Your Company');
  const resolvedCompanyDescription =
    companyDescription?.trim() || (hasWebsite ? inferCompanyDescriptionFromUrl(safeWebsite, resolvedCompanyName) : (defaultCompanyDescription));

  console.info('[findJournalists] Request initiated', {
    website,
    companyName: resolvedCompanyName,
    companyDescription: resolvedCompanyDescription,
  });

  const response = await fetch(`${BACKEND_BASE}/api/generate/journalists`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      website: safeWebsite,
      companyName: resolvedCompanyName,
      companyDescription: resolvedCompanyDescription,
    }),
  });

  if (!response.ok) {
    let errorData: any;
    try {
      errorData = await response.json();
    } catch {
      errorData = { error: await response.text() };
    }
    
    console.error('[findJournalists] Backend request failed', {
      status: response.status,
      statusText: response.statusText,
      errorData,
    });
    
    // Provide user-friendly error messages
    if (errorData.code === 'OPENAI_TIMEOUT') {
      throw new Error('请求超时，OpenAI 服务响应较慢，请稍后重试。');
    } else if (errorData.code === 'OPENAI_CONNECTION_ERROR') {
      throw new Error('网络连接问题，无法访问 OpenAI 服务，请检查网络连接。');
    } else if (errorData.code === 'OPENAI_MISSING_KEY') {
      throw new Error('服务器配置错误，请联系管理员。');
    }
    
    throw new Error(errorData.error || `请求失败: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();

  console.info('[findJournalists] Backend response received', {
    hasJournalists: Array.isArray(payload?.journalists),
    journalistCount: Array.isArray(payload?.journalists) ? payload.journalists.length : 0,
  });

  const journalists = Array.isArray(payload?.journalists) ? payload.journalists : [];

  if (!journalists.length) {
    console.warn('[findJournalists] No journalists returned', { payload });
  }

  const normalized = journalists
    .map(normalizeJournalist)
    .filter((journalist): journalist is Journalist => journalist !== null)
    .slice(0, TARGET_JOURNALIST_COUNT);

  console.info('[findJournalists] Normalized journalists', {
    count: normalized.length,
    preview: normalized.slice(0, 3),
  });

  // persist generation if authenticated (best-effort; ignore errors on client)
  try {
    // dynamic import to avoid circular refs
    const { authService } = await import('@/services/authService');
    if (authService.isAuthenticated()) {
      const historyUrl = safeWebsite || (companyDescription?.slice(0, 200) ?? '');
      authService.saveGenerationHistory({ url: historyUrl, payload: { journalists: normalized } }).catch(() => {});
    }
  } catch {}

  return { journalists: normalized };
}

const normalizeWebsite = (website: string): URL | null => {
  try {
    return new URL(website.startsWith('http') ? website : `https://${website}`);
  } catch {
    return null;
  }
};

const toTitleCase = (value: string) =>
  value
    .toLowerCase()
    .split(' ')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : ''))
    .join(' ')
    .trim();

const extractKeywordTokens = (value: string) =>
  value
    .split(/[-_\s]+/)
    .map((token) => token.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean);

export const inferCompanyNameFromUrl = (website: string) => {
  const parsed = normalizeWebsite(website);
  const fallback = website.replace(/^https?:\/\//, '').split(/[/?#]/)[0] || website;

  if (!parsed) {
    return toTitleCase(fallback.replace(/[-_]/g, ' '));
  }

  const hostSegments = parsed.hostname.replace(/^www\./, '').split('.');
  const primarySegment = hostSegments.length > 1 ? hostSegments[hostSegments.length - 2] : hostSegments[0];
  const tokens = extractKeywordTokens(primarySegment);

  if (!tokens.length) {
    return toTitleCase(primarySegment.replace(/[-_]/g, ' '));
  }

  return toTitleCase(tokens.join(' '));
};

export const inferCompanyDescriptionFromUrl = (website: string, companyName?: string) => {
  const parsed = normalizeWebsite(website);
  const name = companyName || inferCompanyNameFromUrl(website);

  if (!parsed) {
    return `${name} is a startup building modern technology products. Learn more at ${website}.`;
  }

  const hostSegments = parsed.hostname.replace(/^www\./, '').split('.');
  const primarySegment = hostSegments.length > 1 ? hostSegments[hostSegments.length - 2] : hostSegments[0];
  const pathSegments = parsed.pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => extractKeywordTokens(segment).join(' '))
    .filter(Boolean);

  const rawKeywords = [primarySegment, ...pathSegments].flatMap((segment) => extractKeywordTokens(segment));
  const keywords = Array.from(new Set(rawKeywords.map((token) => token.toLowerCase()))).slice(0, 5);

  const focusPhrase = keywords.length
    ? toTitleCase(keywords.join(' '))
    : 'innovative solutions for modern businesses';

  return `${name} is a startup focused on ${focusPhrase}. Explore more at ${parsed.hostname}.`;
};

const sanitizeUrl = (value: string): string | null => {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    if (!url.protocol.startsWith('http')) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
};

const normalizeJournalist = (entry: unknown): Journalist | null => {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const record = entry as Record<string, unknown>;

  const name = coerceString(record.name);
  const parentMediaOrganization = coerceString(record.parentMediaOrganization);
  const coverageSummary = coerceString(record.coverageSummary);
  const rawCoverageLink = coerceString(record.coverageLink);

  if (!name || !parentMediaOrganization || !coverageSummary) {
    return null;
  }

  const relevanceScore = clampNumber(record.relevanceScore, 0, 100);
  const email = coerceNullableString(record.email);
  const linkedIn = coerceNullableString(record.linkedIn);
  const twitter = coerceNullableString(record.twitter);
  const instagram = coerceNullableString(record.instagram);

  const sources = Array.isArray(record.sources)
    ? (record.sources as unknown[])
        .map(normalizeSource)
        .filter((source): source is JournalistSource => source !== null)
    : [];

  const coverageLink = sanitizeUrl(rawCoverageLink) ?? sources[0]?.url ?? null;

  if (!coverageLink) {
    return null;
  }

  return {
    name,
    parentMediaOrganization,
    coverageSummary,
    coverageLink,
    email,
    linkedIn,
    twitter,
    instagram,
    relevanceScore,
    sources,
  };
};

const normalizeSource = (value: unknown): JournalistSource | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const description = coerceString(record.description);
  const url = sanitizeUrl(coerceString(record.url));

  if (!description || !url) {
    return null;
  }

  return {
    description,
    url,
  };
};

const coerceString = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const coerceNullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const clampNumber = (value: unknown, min: number, max: number): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return min;
  }

  return Math.min(Math.max(Math.round(value), min), max);
};

export async function getEmailBody({
  journalist,
  companyName,
  companyDescription,
  website,
}: GetEmailBodyRequest): Promise<GetEmailBodyResponse> {
  const response = await fetch(`${BACKEND_BASE}/api/generate/outreach`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      journalist,
      companyName,
      companyDescription,
      website,
    }),
  });

  if (!response.ok) {
    let errorData: any;
    try {
      errorData = await response.json();
    } catch {
      errorData = { error: await response.text() };
    }
    
    console.error('[getEmailBody] Backend request failed', {
      status: response.status,
      statusText: response.statusText,
      errorData,
    });
    
    // Provide user-friendly error messages
    if (errorData.code === 'OPENAI_TIMEOUT') {
      throw new Error('请求超时，OpenAI 服务响应较慢，请稍后重试。');
    } else if (errorData.code === 'OPENAI_CONNECTION_ERROR') {
      throw new Error('网络连接问题，无法访问 OpenAI 服务，请检查网络连接。');
    } else if (errorData.code === 'OPENAI_MISSING_KEY') {
      throw new Error('服务器配置错误，请联系管理员。');
    }
    
    throw new Error(errorData.error || `请求失败: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();

  console.info('[getEmailBody] Backend response received', {
    hasOutreach: Boolean(payload?.outreach),
  });

  const outreach = normalizeOutreach(payload?.outreach ?? {});

  console.info('[getEmailBody] Outreach messages generated', { journalist: journalist.name });

  return { outreach };
}

const normalizeOutreach = (entry: unknown): OutreachMessages => {
  if (!entry || typeof entry !== 'object') {
    throw new Error('Outreach response missing payload.');
  }

  const record = entry as Record<string, unknown>;

  const outreach: OutreachMessages = {
    email: coerceString(record.email),
    xDirectMessage: coerceString(record.xDirectMessage),
    xPublicPost: coerceString(record.xPublicPost),
    linkedInDirectMessage: coerceString(record.linkedInDirectMessage),
    linkedInPublicPost: coerceString(record.linkedInPublicPost),
  };

  if (!outreach.email) {
    throw new Error('Outreach response missing email message.');
  }

  return outreach;
};
