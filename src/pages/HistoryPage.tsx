import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { authService } from '@/services/authService';
import { findJournalists } from '@/services/journalists';
import { Journalist } from '@/services/journalists';
import { Calendar, RefreshCw, Clock, Globe, ArrowLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useNavigate } from 'react-router-dom';

interface HistoryItem {
  id: number;
  url: string;
  payload: unknown;
  createdAt: string;
}

interface WebsiteHistoryItem {
  id: number;
  url: string;
  createdAt: string;
}

export const HistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [generationHistory, setGenerationHistory] = useState<HistoryItem[]>([]);
  // Removed website-only history due to mixed input (URL or description)
  const [websiteHistory, setWebsiteHistory] = useState<WebsiteHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState<number | null>(null);
  const { toast } = useToast();
  const [detailsItem, setDetailsItem] = useState<HistoryItem | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const [genHistory, webHistory] = await Promise.all([
        authService.getGenerationHistory(),
        Promise.resolve([])
      ]);
      setGenerationHistory(genHistory);
      setWebsiteHistory([]);
    } catch (error) {
      console.error('Failed to load history:', error);
      toast({
        title: "Error",
        description: "Failed to load history",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async (item: HistoryItem) => {
    try {
      setRegenerating(item.id);
      
      // Extract payload and regenerate
      const payload = item.payload as { journalists?: Journalist[] };
      if (!payload.journalists) {
        throw new Error('Invalid history data');
      }

      // For regeneration, we'll use the same URL but create new journalists
      // In a real app, you might want to store more context about the original request
      const result = await findJournalists({
        website: item.url,
        companyName: 'Your Company', // This would ideally be stored in history
        companyDescription: 'Your company description' // This would ideally be stored in history
      });

      toast({
        title: "Success",
        description: `Regenerated ${result.journalists.length} journalists for ${item.url}`,
      });

      // Optionally reload history to show the new generation
      await loadHistory();
    } catch (error) {
      console.error('Regeneration failed:', error);
      toast({
        title: "Error",
        description: "Failed to regenerate journalists",
        variant: "destructive",
      });
    } finally {
      setRegenerating(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getJournalistCount = (payload: unknown) => {
    try {
      const data = payload as { journalists?: Journalist[] };
      return data.journalists?.length || 0;
    } catch {
      return 0;
    }
  };

  const getJournalistsFromPayload = (payload: unknown): Journalist[] => {
    try {
      const data = payload as { journalists?: Journalist[] };
      return Array.isArray(data.journalists) ? data.journalists : [];
    } catch {
      return [];
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading history...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <div className="mb-4">
          <Button variant="ghost" onClick={() => navigate('/')}> 
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
        </div>
        <h1 className="text-3xl font-bold mb-2">History</h1>
        <p className="text-muted-foreground">
          View your previous searches and regenerate journalist lists
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Generation History */}
        <div>
          <h2 className="text-2xl font-semibold mb-4 flex items-center">
            <RefreshCw className="h-6 w-6 mr-2" />
            Generated Results
          </h2>
          
          {generationHistory.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No generation history found. Start by searching for journalists!
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {generationHistory.map((item) => (
                <Card key={item.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg flex items-center">
                          <Globe className="h-4 w-4 mr-2 text-primary" />
                          <span className="text-foreground">
                            {item.url}
                          </span>
                        </CardTitle>
                        <div className="flex items-center mt-2 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3 mr-1" />
                          {formatDate(item.createdAt)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          {getJournalistCount(item.payload)} journalists
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDetailsItem(item)}
                        >
                          View Details
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Button
                      onClick={() => handleRegenerate(item)}
                      disabled={regenerating === item.id}
                      size="sm"
                      className="w-full"
                    >
                      {regenerating === item.id ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Regenerating...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Regenerate
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Website History removed */}
      </div>

      <Separator className="my-8" />
      
      <div className="text-center text-muted-foreground">
        <p className="text-sm">
          History is automatically saved when you're logged in. 
          You can regenerate previous searches to get fresh journalist recommendations.
        </p>
      </div>

      {/* Details Dialog */}
      <Dialog open={!!detailsItem} onOpenChange={() => setDetailsItem(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Generation Details</DialogTitle>
          </DialogHeader>
          {detailsItem ? (
            <div className="space-y-4 max-h-[70vh] overflow-auto pr-2">
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">URL:</span> {detailsItem.url}
                <span className="ml-4">
                  <span className="font-medium text-foreground">Time:</span> {formatDate(detailsItem.createdAt)}
                </span>
              </div>
              {getJournalistsFromPayload(detailsItem.payload).length === 0 ? (
                <div className="text-sm text-muted-foreground">No journalists found in this record.</div>
              ) : (
                <div className="space-y-3">
                  {getJournalistsFromPayload(detailsItem.payload).map((j, idx) => (
                    <Card key={`${j.coverageLink || j.name}-${idx}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex-1 min-w-[220px]">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-semibold">{j.name}</span>
                              <Badge variant="secondary">{j.parentMediaOrganization}</Badge>
                              <Badge>
                                Score: {typeof j.relevanceScore === 'number' ? j.relevanceScore : 0}
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {j.coverageSummary}{' '}
                              {j.coverageLink && (
                                <a
                                  href={j.coverageLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline"
                                >
                                  Read ↗
                                </a>
                              )}
                            </div>
                            <div className="mt-2 text-sm flex gap-4 flex-wrap">
                              {j.email && (
                                <a href={`mailto:${j.email}`} className="text-primary hover:underline">
                                  {j.email}
                                </a>
                              )}
                              {j.twitter && (
                                <a
                                  href={/^https?:\/\//.test(j.twitter) ? j.twitter : `https://twitter.com/${j.twitter.replace(/^@/, '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline"
                                >
                                  Twitter
                                </a>
                              )}
                              {j.linkedIn && (
                                <a
                                  href={/^https?:\/\//.test(j.linkedIn) ? j.linkedIn : `https://www.linkedin.com/in/${j.linkedIn}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline"
                                >
                                  LinkedIn
                                </a>
                              )}
                              {j.instagram && (
                                <a
                                  href={/^https?:\/\//.test(j.instagram) ? j.instagram : `https://www.instagram.com/${j.instagram.replace(/^@/, '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline"
                                >
                                  Instagram
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                        {Array.isArray(j.sources) && j.sources.length > 0 && (
                          <div className="mt-3 text-sm">
                            <span className="font-medium text-foreground mr-2">Sources:</span>
                            <span className="space-x-2">
                              {j.sources.map((s, si) => (
                                <a
                                  key={`${s.url}-${si}`}
                                  href={s.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline"
                                >
                                  {s.description}
                                </a>
                              ))}
                            </span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};

