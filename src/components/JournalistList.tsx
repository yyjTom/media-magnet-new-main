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
import { authService } from '@/services/authService';

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
  // 简化状态管理 - 每个记者一个状态对象
  const [journalistStates, setJournalistStates] = useState<Record<string, {
    outreach: OutreachMessages | null;
    loading: boolean;
    error: string | null;
  }>>({});
  
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

    // 只有在真正的错误情况下才重置按钮状态
    if (isError) {
      setTimeout(() => callback([]), 100);
      return;
    }

    // 只有当记者列表有10条数据时才重置按钮状态
    if (data?.journalists && data.journalists.length === 10) {
      // 保存生成历史记录
      authService.saveGenerationHistory({
        url: website,
        payload: { journalists: data.journalists }
      }).catch(() => {
        // 保存失败不影响正常功能
        console.warn('Failed to save generation history');
      });
      
      // 延迟调用确保记者列表已经渲染到DOM中
      setTimeout(() => callback(data.journalists), 200);
    }
    
    // 如果没有数据或数据不足10条，不调用callback，保持按钮的loading状态
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

  // 生成记者的唯一键
  const getJournalistKey = (journalist: Journalist, index: number) => 
    `${journalist.email ?? journalist.coverageLink ?? journalist.name}-${index}`;

  // 自动开始为所有记者生成 outreach
  useEffect(() => {
    if (journalistsList.length === 0) return;
    
    let cancelled = false;
    console.log(`🚀 Starting concurrent outreach generation for ${journalistsList.length} journalists`);

    const generateOutreach = async () => {
      // 为每个记者创建独立的异步任务
      const tasks = journalistsList.map(async (journalist, i) => {
        if (cancelled) return;
        
        const key = getJournalistKey(journalist, i);
        
        // 跳过已经处理过的
        if (journalistStates[key]) return;
        
        console.log(`📝 Starting ${i + 1}/${journalistsList.length}: ${journalist.name}`);
        
        // 设置加载状态
        setJournalistStates(prev => ({
          ...prev,
          [key]: { outreach: null, loading: true, error: null }
        }));
        
        try {
          const result = await getEmailBody({ 
            journalist, 
            companyName, 
            companyDescription, 
            website 
          });
          
          if (cancelled) return;
          
          console.log(`✅ Success for ${journalist.name}`);
          setJournalistStates(prev => ({
            ...prev,
            [key]: { outreach: result.outreach, loading: false, error: null }
          }));
          
        } catch (e) {
          if (cancelled) return;
          
          const errorMessage = e instanceof Error ? e.message : 'Generation failed';
          console.log(`❌ Error for ${journalist.name}:`, errorMessage);
          setJournalistStates(prev => ({
            ...prev,
            [key]: { outreach: null, loading: false, error: errorMessage }
          }));
        }
      });

      // 并发执行所有任务
      await Promise.allSettled(tasks);
      
      if (!cancelled) {
        console.log('🎉 All outreach generation completed concurrently');
      }
    };

    generateOutreach();

    return () => {
      cancelled = true;
      console.log('🛑 Outreach generation cancelled');
    };
  }, [journalistsList, companyName, companyDescription, website]);

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

    // 只展开/收起面板，不发起请求（由自动预取处理）
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
            const journalistKey = getJournalistKey(journalist, index);
            const isExpanded = expandedJournalists.has(journalistKey);
            const state = journalistStates[journalistKey] || { outreach: null, loading: false, error: null };
            const { outreach, loading: isGeneratingOutreach, error: outreachError } = state;
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
                        {journalist.coverageLink && journalist.coverageLink !== 'null' && journalist.coverageLink.trim() !== '' ? (
                          <a
                            href={journalist.coverageLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary-glow"
                            onClick={handleCoverageClick}
                          >
                            Read coverage ↗
                          </a>
                        ) : (
                          <a
                            href={`https://www.google.com/search?q=${encodeURIComponent(`"${journalist.name}" journalist "${journalist.parentMediaOrganization}"`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary-glow"
                            onClick={handleCoverageClick}
                          >
                            Search articles ↗
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
                      className={`whitespace-nowrap ${
                        outreachError 
                          ? 'bg-gray-200 text-gray-500 border-gray-300 hover:bg-gray-200' 
                          : isGeneratingOutreach 
                            ? 'opacity-75' 
                            : outreach
                              ? 'border-green-300 bg-green-50 hover:bg-green-100'
                              : ''
                      }`}
                      disabled={!!outreachError}
                    >
                      {isExpanded ? (
                        <>
                          Hide Message <ChevronUp className="ml-2 h-4 w-4" />
                        </>
                      ) : outreachError ? (
                        <>
                          Failed <ChevronDown className="ml-2 h-4 w-4" />
                        </>
                      ) : isGeneratingOutreach ? (
                        <>
                          Generating... <ChevronDown className="ml-2 h-4 w-4 animate-spin" />
                        </>
                      ) : outreach ? (
                        <>
                          View Message <ChevronDown className="ml-2 h-4 w-4" />
                        </>
                      ) : (
                        <>
                          Loading... <ChevronDown className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </div>


                  {isExpanded && (
                    <div className="mt-6 pt-6 border-t border-border">
                      

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

