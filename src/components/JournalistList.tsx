import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, Mail, Twitter, Linkedin, Instagram } from 'lucide-react';
import {
  findJournalists,
  getEmailBody,
  inferCompanyNameFromUrl,
  inferCompanyDescriptionFromUrl,
  type Journalist,
  type OutreachMessages,
} from '@/services/journalists';
import { analytics } from '@/lib/analytics';

interface JournalistListProps {
  website: string;
  onResults?: (journalists: Journalist[]) => void;
}

const toProfileUrl = (value: string | null, baseUrl: string) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const stripped = trimmed.replace(/^@/, '');
  return `${baseUrl}${stripped}`;
};

export const JournalistList = ({ website, onResults }: JournalistListProps) => {
  const [expandedJournalists, setExpandedJournalists] = useState<Set<string>>(new Set());
  const companyName = useMemo(() => inferCompanyNameFromUrl(website), [website]);
  const companyDescription = useMemo(
    () => inferCompanyDescriptionFromUrl(website, companyName),
    [companyName, website],
  );
  const onResultsRef = useRef(onResults);
  const [outreachMessages, setOutreachMessages] = useState<Record<string, OutreachMessages>>({});
  const [outreachErrors, setOutreachErrors] = useState<Record<string, string>>({});
  const [outreachLoading, setOutreachLoading] = useState<Record<string, boolean>>({});
  const lastResultsStatusRef = useRef<{ website: string; status: 'success' | 'empty' | 'error' } | null>(null);

  useEffect(() => {
    onResultsRef.current = onResults;
  }, [onResults]);

  const {
    data,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['findJournalists', website],
    queryFn: () =>
      findJournalists({
        website,
        companyName,
        companyDescription,
      }),
    enabled: Boolean(website),
    // 防止因为窗口聚焦/网络重连造成重复请求从而重复写入历史
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    staleTime: 1000 * 60 * 10, // 10 分钟内视为新鲜，避免再次拉取
  });

  useEffect(() => {
    const callback = onResultsRef.current;
    if (!callback) {
      return;
    }

    if (isError || !data?.journalists) {
      callback([]);
      return;
    }

    callback(data.journalists);
  }, [data?.journalists, isError]);
  const journalistsList = useMemo(() => data?.journalists ?? [], [data?.journalists]);
  const resultsCount = journalistsList.length;

  useEffect(() => {
    if (!website || isLoading) {
      return;
    }

    const normalizedWebsite = website.trim();
    const lastTracked = lastResultsStatusRef.current;

    if (isError) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (!lastTracked || lastTracked.website !== normalizedWebsite || lastTracked.status !== 'error') {
        analytics.journalistResultsFailed({ website: normalizedWebsite, errorMessage: message });
        lastResultsStatusRef.current = { website: normalizedWebsite, status: 'error' };
      }
      return;
    }

    const status: 'success' | 'empty' = resultsCount > 0 ? 'success' : 'empty';

    if (!lastTracked || lastTracked.website !== normalizedWebsite || lastTracked.status !== status) {
      if (status === 'success') {
        analytics.journalistResultsLoaded({ website: normalizedWebsite, count: resultsCount });
      } else {
        analytics.journalistResultsEmpty({ website: normalizedWebsite });
      }
      lastResultsStatusRef.current = { website: normalizedWebsite, status };
    }
  }, [website, resultsCount, isLoading, isError, error]);

  // Optional: validate links to avoid 404 before rendering (backend checks reachability)
  const [validatedMap, setValidatedMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const urls = new Set<string>();
    journalistsList.forEach((j) => {
      if (j.coverageLink) urls.add(j.coverageLink);
      (j.sources || []).forEach((s) => s.url && urls.add(s.url));
    });
    if (urls.size === 0) return;

    // call backend validator
    const base = import.meta.env.PROD
      ? ''
      : `${location.protocol}//${location.hostname}:3001`;
    fetch(`${base}/api/auth/validate-urls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: Array.from(urls) }),
    })
      .then((r) => r.json())
      .then((payload) => {
        const map: Record<string, boolean> = {};
        (payload?.results || []).forEach((it: { url: string; ok: boolean }) => {
          map[it.url] = !!it.ok;
        });
        setValidatedMap(map);
      })
      .catch(() => {});
  }, [journalistsList]);

  const outreachMutation = useMutation({
    mutationFn: ({ journalist }: { journalist: Journalist }) =>
      getEmailBody({ journalist, companyName, companyDescription, website }),
  });

  // Prefetch outreach with limited concurrency; prioritize first N items
  useEffect(() => {
    let cancelled = false;
    const PREFETCH_FIRST = 6;
    const CONCURRENCY = 4;

    const toKey = (j: Journalist, idx: number) => `${j.email ?? j.coverageLink ?? j.name}-${idx}`;

    const tasks: Array<{ j: Journalist; idx: number; key: string }> = journalistsList
      .map((j, idx) => ({ j, idx, key: toKey(j, idx) }))
      .filter(({ key }) => !outreachMessages[key] && !outreachLoading[key]);

    if (tasks.length === 0) return;

    // Reorder: first N at front, rest follow
    const head = tasks.slice(0, PREFETCH_FIRST);
    const tail = tasks.slice(PREFETCH_FIRST);
    const ordered = [...head, ...tail];

    const runBatch = async (batch: typeof tasks) => {
      await Promise.all(
        batch.map(async ({ j, idx, key }) => {
          if (cancelled) return;
          setOutreachLoading((prev) => ({ ...prev, [key]: true }));
          try {
            const { outreach } = await getEmailBody({ journalist: j, companyName, companyDescription, website });
            if (cancelled) return;
            setOutreachMessages((prev) => ({ ...prev, [key]: outreach }));
          } catch (e) {
            if (cancelled) return;
            const message = e instanceof Error ? e.message : 'Unable to generate outreach messages.';
            setOutreachErrors((prev) => ({ ...prev, [key]: message }));
          } finally {
            if (cancelled) return;
            setOutreachLoading((prev) => ({ ...prev, [key]: false }));
          }
        })
      );
    };

    (async () => {
      for (let i = 0; i < ordered.length; i += CONCURRENCY) {
        if (cancelled) break;
        const batch = ordered.slice(i, i + CONCURRENCY);
        await runBatch(batch);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [journalistsList, companyName, companyDescription, website, outreachMessages, outreachLoading]);

  const toggleExpanded = (journalistKey: string, journalist: Journalist) => {
    const willExpand = !expandedJournalists.has(journalistKey);
    const newExpanded = new Set(expandedJournalists);
    if (newExpanded.has(journalistKey)) {
      newExpanded.delete(journalistKey);
    } else {
      newExpanded.add(journalistKey);
    }
    setExpandedJournalists(newExpanded);

    analytics.outreachPanelToggled({
      journalistName: journalist.name,
      organization: journalist.parentMediaOrganization,
      relevanceScore: journalist.relevanceScore,
      expanded: willExpand,
    });

    if (!willExpand) {
      return;
    }

    if (outreachMessages[journalistKey] || outreachLoading[journalistKey]) {
      return;
    }

    analytics.outreachRequested({
      journalistName: journalist.name,
      organization: journalist.parentMediaOrganization,
      relevanceScore: journalist.relevanceScore,
      website,
    });

    setOutreachLoading((prev) => ({ ...prev, [journalistKey]: true }));
    setOutreachErrors((prev) => {
      const { [journalistKey]: _ignored, ...rest } = prev;
      return rest;
    });

    outreachMutation.mutate(
      { journalist },
      {
        onSuccess: (response) => {
          setOutreachMessages((prev) => ({ ...prev, [journalistKey]: response.outreach }));
          analytics.outreachGenerated({
            journalistName: journalist.name,
            organization: journalist.parentMediaOrganization,
            relevanceScore: journalist.relevanceScore,
            website,
          });
        },
        onError: (mutationError) => {
          const message =
            mutationError instanceof Error ? mutationError.message : 'Unable to generate outreach messages.';
          setOutreachErrors((prev) => ({ ...prev, [journalistKey]: message }));
          analytics.outreachGenerationFailed({
            journalistName: journalist.name,
            organization: journalist.parentMediaOrganization,
            relevanceScore: journalist.relevanceScore,
            website,
            errorMessage: message,
          });
        },
        onSettled: () => {
          setOutreachLoading((prev) => ({ ...prev, [journalistKey]: false }));
        },
      },
    );
  };

  const getRelevanceBadgeColor = (relevanceScore: number) => {
    if (relevanceScore >= 90) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (relevanceScore >= 75) return 'bg-blue-100 text-blue-800 border-blue-200';
    return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  };

  if (isLoading) {
    return (
      <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-4 max-w-4xl text-center text-muted-foreground">
          Loading journalist recommendations...
        </div>
      </section>
    );
  }

  if (isError) {
    console.error('[JournalistList] Query failed', { error, website, companyName, companyDescription });
    return (
      <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-4 max-w-4xl text-center text-destructive">
          We couldn't load journalist recommendations right now. Please try again shortly.
          <pre className="mt-4 whitespace-pre-wrap text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'Unknown error'}
          </pre>
        </div>
      </section>
    );
  }

  if (!journalistsList.length) {
    return (
      <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-4 max-w-4xl text-center text-muted-foreground">
          No journalist matches yet—try another website once we're able to pull live data.
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 bg-secondary/30">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">
            Your Personalized Journalist List
          </h2>
          <p className="text-lg text-muted-foreground">
            Curated outreach targets for {companyName}
          </p>
        </div>

        <div className="space-y-4">
          {journalistsList.map((journalist, index) => {
            const twitterUrl = toProfileUrl(journalist.twitter, 'https://twitter.com/');
            const linkedInUrl = toProfileUrl(journalist.linkedIn, 'https://www.linkedin.com/in/');
            const instagramUrl = toProfileUrl(journalist.instagram, 'https://www.instagram.com/');
            const journalistKey = `${journalist.email ?? journalist.coverageLink ?? journalist.name}-${index}`;
            const isExpanded = expandedJournalists.has(journalistKey);
            const outreach = outreachMessages[journalistKey];
            const isGeneratingOutreach = Boolean(outreachLoading[journalistKey]);
            const outreachError = outreachErrors[journalistKey];
            const journalistName = journalist.name;
            const organization = journalist.parentMediaOrganization;

            const handleCoverageClick = () => {
              analytics.coverageLinkClicked({ journalistName, organization });
            };

            const handleProfileClick = (platform: 'twitter' | 'linkedin' | 'instagram') => () => {
              analytics.profileLinkClicked({ journalistName, organization, platform });
            };

            const handleCopyEmail = () => {
              if (!outreach) {
                return;
              }

              analytics.outreachEmailCopied({ journalistName, organization });
              navigator.clipboard
                .writeText(outreach.email)
                .catch((copyError) => {
                  if (import.meta.env.DEV) {
                    console.warn('[JournalistList] Failed to copy outreach email', copyError);
                  }
                });
            };

            const handleSendEmail = () => {
              if (!outreach || !journalist.email) {
                return;
              }

              analytics.outreachSendEmailClicked({ journalistName, organization, source: 'cta_button' });
              window.open(
                `mailto:${journalist.email}?subject=Story opportunity - ${companyName}&body=${encodeURIComponent(outreach.email)}`,
              );
            };

            return (
              <Card key={journalistKey} className="card-shadow hover-scale smooth-transition">
                <div className="p-6">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-[220px]">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="text-xl font-bold text-foreground">{journalist.name}</h3>
                        <Badge className="bg-primary/10 text-primary border border-primary/20 font-semibold">
                          {journalist.parentMediaOrganization}
                        </Badge>
                        <Badge className={`${getRelevanceBadgeColor(journalist.relevanceScore)} font-semibold`}>
                          Relevance: {journalist.relevanceScore}/100
                        </Badge>
                      </div>
                      <p className="text-muted-foreground mb-3">
                        {journalist.coverageSummary}{' '}
                        {journalist.coverageLink && (
                          <a
                            href={journalist.coverageLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary-glow"
                            onClick={handleCoverageClick}
                          >
                            Read coverage ↗
                          </a>
                        )}
                      </p>

                      <div className="flex items-center gap-4 flex-wrap text-sm">
                        {journalist.email && (
                          <a
                            href={`mailto:${journalist.email}`}
                            className="inline-flex items-center gap-2 text-primary hover:text-primary-glow smooth-transition"
                            aria-label={`Email ${journalist.name}`}
                            onClick={() =>
                              analytics.outreachSendEmailClicked({
                                journalistName,
                                organization,
                                source: 'header_mailto',
                              })
                            }
                          >
                            <Mail className="h-4 w-4" />
                            Email
                          </a>
                        )}
                        {twitterUrl && (
                          <a
                            href={twitterUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-primary hover:text-primary-glow smooth-transition"
                            onClick={handleProfileClick('twitter')}
                          >
                            <Twitter className="h-4 w-4" />
                            X / Twitter
                          </a>
                        )}
                        {linkedInUrl && (
                          <a
                            href={linkedInUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-primary hover:text-primary-glow smooth-transition"
                            onClick={handleProfileClick('linkedin')}
                          >
                            <Linkedin className="h-4 w-4" />
                            LinkedIn
                          </a>
                        )}
                        {instagramUrl && (
                          <a
                            href={instagramUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-primary hover:text-primary-glow smooth-transition"
                            onClick={handleProfileClick('instagram')}
                          >
                            <Instagram className="h-4 w-4" />
                            Instagram
                          </a>
                        )}
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleExpanded(journalistKey, journalist)}
                      className="whitespace-nowrap"
                    >
                      {isExpanded ? (
                        <>
                          Hide Message <ChevronUp className="ml-2 h-4 w-4" />
                        </>
                      ) : (
                        <>
                          View Message <ChevronDown className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                    {journalist.sources.length > 0 && (
                      <div>
                        <span className="font-semibold text-foreground mr-2">Sources:</span>
                        <span className="space-x-2">
                          {journalist.sources.map((source, index) => (
                            source.url ? (
                              <a
                                key={`${source.url}-${index}`}
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:text-primary-glow"
                              >
                                {source.description}
                              </a>
                            ) : (
                              <span key={`${source.url}-${index}`} className="text-muted-foreground/70">
                                {source.description}
                              </span>
                            )
                          ))}
                        </span>
                      </div>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="mt-6 pt-6 border-t border-border">
                      <h4 className="font-semibold text-foreground mb-3">Personalized Outreach Drafts</h4>

                      {isGeneratingOutreach && !outreach && (
                        <div className="bg-muted p-4 rounded-lg text-sm text-muted-foreground">
                          Generating tailored outreach messages...
                        </div>
                      )}

                      {outreachError && (
                        <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-lg text-sm">
                          {outreachError}
                        </div>
                      )}

                      {outreach && !outreachError && (
                        <div className="space-y-4">
                          <div className="bg-muted p-4 rounded-lg">
                            <h5 className="font-semibold text-foreground mb-2">Email (cold reach)</h5>
                            <pre className="whitespace-pre-wrap text-sm text-muted-foreground font-mono">
                              {outreach.email}
                            </pre>
                          </div>
                          <div className="bg-muted p-4 rounded-lg">
                            <h5 className="font-semibold text-foreground mb-2">X Direct Message</h5>
                            <pre className="whitespace-pre-wrap text-sm text-muted-foreground font-mono">
                              {outreach.xDirectMessage}
                            </pre>
                          </div>
                          <div className="bg-muted p-4 rounded-lg">
                            <h5 className="font-semibold text-foreground mb-2">X Public Post</h5>
                            <pre className="whitespace-pre-wrap text-sm text-muted-foreground font-mono">
                              {outreach.xPublicPost}
                            </pre>
                          </div>
                          <div className="bg-muted p-4 rounded-lg">
                            <h5 className="font-semibold text-foreground mb-2">LinkedIn Direct Message</h5>
                            <pre className="whitespace-pre-wrap text-sm text-muted-foreground font-mono">
                              {outreach.linkedInDirectMessage}
                            </pre>
                          </div>
                          <div className="bg-muted p-4 rounded-lg">
                            <h5 className="font-semibold text-foreground mb-2">LinkedIn Public Post</h5>
                            <pre className="whitespace-pre-wrap text-sm text-muted-foreground font-mono">
                              {outreach.linkedInPublicPost}
                            </pre>
                          </div>
                        </div>
                      )}

                      <div className="mt-4 flex gap-3 flex-wrap">
                        <Button
                          variant="default"
                          size="sm"
                          disabled={!outreach || isGeneratingOutreach}
                          onClick={handleCopyEmail}
                        >
                          Copy Email
                        </Button>
                        {journalist.email && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!outreach || isGeneratingOutreach}
                            onClick={handleSendEmail}
                          >
                            Send Email
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
};
