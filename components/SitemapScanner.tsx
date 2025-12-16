
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { BlogPost, SitemapState, AppConfig, PostPriority } from '../types';
import { fetchAndParseSitemap, fetchPageContent, checkForAffiliateLinks, runConcurrent, analyzeContentAndFindProduct, generateProductBoxHtml, insertIntoContent, pushToWordPress, calculatePostPriority } from '../utils';
import Toastify from 'toastify-js';

interface SitemapScannerProps {
  onPostSelect: (post: BlogPost) => void;
  savedState: SitemapState;
  onStateChange: (state: SitemapState) => void;
  config: AppConfig;
}

export const SitemapScanner: React.FC<SitemapScannerProps> = ({ onPostSelect, savedState, onStateChange, config }) => {
  const [sitemapUrl, setSitemapUrl] = useState(savedState.url || '');
  const [status, setStatus] = useState<'idle' | 'scanning' | 'analyzing' | 'processing'>('idle');
  const [activeTab, setActiveTab] = useState<'critical' | 'opportunity' | 'monetized' | 'all'>('critical');
  const [stopSignal, setStopSignal] = useState(false);
  const [isFullyAuto, setIsFullyAuto] = useState(false);
  
  const stateRef = useRef(savedState);
  useEffect(() => { stateRef.current = savedState; }, [savedState]);

  const handleFetchSitemap = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('scanning');
    try {
      const posts = await fetchAndParseSitemap(sitemapUrl);
      const initialPosts: BlogPost[] = posts.map(p => ({
          ...p, status: 'publish', monetizationStatus: 'opportunity', autoPilotStatus: 'idle', content: '', priority: 'low', postType: 'unknown'
      }));
      onStateChange({ url: sitemapUrl, posts: initialPosts, lastScanned: Date.now() });
      Toastify({ text: `Synced ${posts.length} posts`, backgroundColor: "#10b981" }).showToast();
      
      // Auto-trigger priority analysis
      setTimeout(() => runPriorityAnalysis(initialPosts), 100);

    } catch (e) {
      Toastify({ text: "Sitemap connection failed. Check URL.", backgroundColor: "#ef4444" }).showToast();
      setStatus('idle');
    }
  };

  // Ultra Smart: Two-Phase Analysis to save API calls
  const runPriorityAnalysis = async (posts: BlogPost[]) => {
      setStatus('analyzing');
      const postMap = new Map(posts.map(p => [p.url, p]));
      
      // PHASE 1: Instant Heuristic Scan (Zero API Calls)
      let reviewsOrListiclesFound = 0;
      posts.forEach(p => {
          const analysis = calculatePostPriority(p.title, ''); // Empty HTML triggers title-only mode
          if (analysis.type === 'review' || analysis.type === 'listicle') reviewsOrListiclesFound++;
          postMap.set(p.url, { ...p, priority: analysis.priority, postType: analysis.type, monetizationStatus: analysis.status });
      });
      
      // Instant UI Update
      onStateChange({ ...stateRef.current, posts: Array.from(postMap.values()) });

      // PHASE 2: Targeted Deep Scan (Only for high-value targets without content)
      // We only fetch HTML for items that LOOK like opportunities but haven't been verified yet
      const highValueTargets = Array.from(postMap.values()).filter(p => 
          (p.postType === 'review' || p.postType === 'listicle') && 
          !p.content && 
          p.monetizationStatus === 'opportunity'
      );
      
      if (highValueTargets.length > 0) {
          Toastify({ text: `Deep scanning ${highValueTargets.length} potential opportunities...`, backgroundColor: "#3b82f6" }).showToast();
          
          let processed = 0;
          await runConcurrent(highValueTargets, 5, async (post) => {
              if (stopSignal) return;
              try {
                  // Fetch lightweight content
                  const page = await fetchPageContent(post.url); // This now uses cache
                  const analysis = calculatePostPriority(post.title, page.content);
                  
                  postMap.set(post.url, { 
                      ...post, 
                      content: page.content.substring(0, 1000), // Store snippet to verify cache presence later
                      priority: analysis.priority,
                      postType: analysis.type,
                      monetizationStatus: analysis.status
                  });
              } catch(e) {
                  console.warn("Analysis failed for", post.title);
              } finally {
                  processed++;
                  // Batch UI updates to avoid react render lag
                  if (processed % 5 === 0) {
                       onStateChange({ ...stateRef.current, posts: Array.from(postMap.values()) });
                  }
              }
          });
      }
      
      onStateChange({ ...stateRef.current, posts: Array.from(postMap.values()) });
      setStatus('idle');
  };

  const handleReset = () => {
      if(confirm("Are you sure? This will wipe all scanned data.")) {
          onStateChange({ url: '', posts: [] });
          setSitemapUrl('');
          Toastify({ text: "Data Wiped", backgroundColor: "#ef4444" }).showToast();
      }
  };

  const runAutonomousPipeline = async () => {
    if (!config.wpUrl) return Toastify({ text: "Configure WP first", backgroundColor: "#f59e0b" }).showToast();
    setStopSignal(false);
    setStatus('processing');
    
    // Target critical opportunities first
    const targets = savedState.posts
        .filter(p => p.monetizationStatus === 'opportunity' && p.autoPilotStatus !== 'published')
        .sort((a, b) => {
            const priorityScore = { critical: 3, high: 2, medium: 1, low: 0 };
            return (priorityScore[b.priority || 'low'] - priorityScore[a.priority || 'low']);
        });

    const postMap = new Map(savedState.posts.map(p => [p.url, p]));

    let updateTimer: any = null;
    const triggerUIUpdate = () => {
        if (updateTimer) return;
        updateTimer = setTimeout(() => {
            onStateChange({ ...stateRef.current, posts: Array.from(postMap.values()) });
            updateTimer = null;
        }, 500); 
    };

    await runConcurrent(targets, config.concurrencyLimit || 3, async (post: BlogPost) => {
        if (stopSignal) return;
        try {
            postMap.set(post.url, { ...post, autoPilotStatus: 'analyzing' });
            triggerUIUpdate();

            // Cached fetch via utils
            const page = await fetchPageContent(post.url); 
            
            // Double check monetization
            if (checkForAffiliateLinks(page.content)) {
                postMap.set(post.url, { ...post, monetizationStatus: 'monetized', autoPilotStatus: 'idle', priority: 'medium' });
                return;
            }

            // AI Analysis (Cached)
            const analysis = await analyzeContentAndFindProduct(page.title, page.content, config);
            
            if (analysis.confidence > 50 && analysis.product.asin) {
                if (isFullyAuto && analysis.confidence >= (config.autoPublishThreshold || 85)) {
                    postMap.set(post.url, { ...post, autoPilotStatus: 'publishing' });
                    triggerUIUpdate();
                    
                    const box = generateProductBoxHtml(analysis.product, config.amazonTag, config.enableStickyBar);
                    const finalHtml = insertIntoContent(page.content, box, 'smart_middle');
                    await pushToWordPress(config, page.id || post.id, finalHtml);
                    
                    postMap.set(post.url, { ...post, monetizationStatus: 'monetized', autoPilotStatus: 'published', aiConfidence: analysis.confidence });
                } else {
                    postMap.set(post.url, { ...post, autoPilotStatus: 'found', aiConfidence: analysis.confidence, proposedProduct: analysis.product, id: page.id || post.id });
                }
            } else {
                postMap.set(post.url, { ...post, autoPilotStatus: 'failed' });
            }
        } catch (e) {
            postMap.set(post.url, { ...post, autoPilotStatus: 'failed' });
        } finally {
            triggerUIUpdate();
        }
    });

    if(updateTimer) clearTimeout(updateTimer);
    onStateChange({ ...stateRef.current, posts: Array.from(postMap.values()) });
    setStatus('idle');
  };

  const filteredPosts = useMemo(() => {
      let p = savedState.posts;
      if (activeTab === 'critical') p = p.filter(x => x.priority === 'critical' || x.priority === 'high');
      else if (activeTab === 'opportunity') p = p.filter(x => x.monetizationStatus === 'opportunity');
      else if (activeTab === 'monetized') p = p.filter(x => x.monetizationStatus === 'monetized');
      return p;
  }, [savedState.posts, activeTab]);

  const stats = useMemo(() => ({
      total: savedState.posts.length,
      critical: savedState.posts.filter(p => p.priority === 'critical').length,
      opportunities: savedState.posts.filter(p => p.monetizationStatus === 'opportunity').length,
      monetized: savedState.posts.filter(p => p.monetizationStatus === 'monetized').length
  }), [savedState.posts]);

  return (
    <div className="flex flex-col h-full bg-dark-950 md:flex-row relative">
      
      {/* Sidebar Stats */}
      <div className="hidden md:flex w-72 bg-dark-900 border-r border-dark-800 flex-col p-6 z-10">
          <div className="mb-8">
             <h1 className="text-2xl font-black text-white tracking-tighter">Amz<span className="text-brand-500">Pilot</span> <span className="text-[10px] align-top bg-brand-900 text-brand-300 px-1 rounded">PRO</span></h1>
             <p className="text-xs text-gray-500 mt-1">Autonomous Monetization Core</p>
          </div>
          
          <div className="space-y-4 mb-8">
              <div className="bg-red-900/10 p-4 rounded-xl border border-red-900/30 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-red-600/10 rounded-full blur-xl -mr-4 -mt-4"></div>
                  <div className="text-xs text-red-400 uppercase font-bold mb-1">Critical Fixes</div>
                  <div className="text-3xl font-black text-white">{stats.critical}</div>
                  <div className="text-[10px] text-red-400/60 mt-2">Revenue leaking from review posts</div>
              </div>
              <div className="bg-dark-950 p-4 rounded-xl border border-dark-800">
                  <div className="text-xs text-gray-500 uppercase font-bold">Total Posts</div>
                  <div className="text-xl font-bold text-white">{stats.total}</div>
              </div>
              <div className="bg-dark-950 p-4 rounded-xl border border-dark-800">
                  <div className="text-xs text-gray-500 uppercase font-bold">Monetized</div>
                  <div className="text-xl font-bold text-white">{stats.monetized}</div>
              </div>
          </div>
          
          <button onClick={() => runPriorityAnalysis(savedState.posts)} disabled={status !== 'idle'} className="w-full bg-dark-800 hover:bg-dark-700 text-gray-300 font-bold text-xs py-3 rounded-lg border border-dark-700 mb-2">
              <i className="fa-solid fa-sync mr-2"></i> Re-Analyze Priorities
          </button>
          
          <button onClick={handleReset} className="mt-auto text-xs text-red-500 hover:text-red-400 font-bold py-3 flex items-center justify-center opacity-50 hover:opacity-100">
             <i className="fa-solid fa-trash mr-2"></i> Reset Data
          </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Command Bar */}
        <div className="bg-dark-900/50 backdrop-blur-md border-b border-dark-800 p-4 flex flex-col md:flex-row gap-4 items-center z-20">
             <form onSubmit={handleFetchSitemap} className="w-full flex gap-2">
                <input type="url" value={sitemapUrl} onChange={e => setSitemapUrl(e.target.value)} placeholder="https://yoursite.com/post-sitemap.xml" className="flex-1 bg-dark-950 border border-dark-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-500 outline-none text-sm font-mono min-w-0 shadow-inner" />
                <button type="submit" disabled={status !== 'idle'} className="bg-white text-dark-900 font-bold px-6 rounded-xl hover:bg-gray-200 whitespace-nowrap active:scale-95 transition-transform">
                   {status === 'scanning' ? <i className="fa-solid fa-spinner fa-spin"></i> : 'Sync'}
                </button>
             </form>
             <button onClick={status === 'processing' ? () => setStopSignal(true) : runAutonomousPipeline} className={`w-full md:w-auto px-6 py-3 rounded-xl font-bold text-white shadow-lg whitespace-nowrap active:scale-95 transition-transform flex items-center gap-2 ${status === 'processing' ? 'bg-red-600' : 'bg-brand-600 hover:bg-brand-500'}`}>
                {status === 'processing' ? <><i className="fa-solid fa-stop"></i> STOP</> : <><i className="fa-solid fa-robot"></i> RUN AUTO-PILOT</>}
             </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-dark-800 bg-dark-950 px-4 pt-2 gap-1 overflow-x-auto">
            {[
                { id: 'critical', label: 'Critical Fixes', icon: 'fa-triangle-exclamation', color: 'text-red-500' },
                { id: 'opportunity', label: 'All Opportunities', icon: 'fa-magnifying-glass', color: 'text-yellow-500' },
                { id: 'monetized', label: 'Monetized', icon: 'fa-check-circle', color: 'text-green-500' },
                { id: 'all', label: 'All Posts', icon: 'fa-list', color: 'text-gray-400' }
            ].map(tab => (
                <button 
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`px-4 py-3 text-xs font-bold uppercase tracking-wide flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${activeTab === tab.id ? 'border-brand-500 text-white bg-dark-900 rounded-t-lg' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                >
                    <i className={`fa-solid ${tab.icon} ${tab.color}`}></i> {tab.label}
                </button>
            ))}
        </div>

        {/* List View */}
        <div className="flex-1 overflow-y-auto p-4 pb-20 bg-dark-950">
            {status === 'analyzing' && (
                <div className="flex items-center justify-center py-8 text-brand-500 animate-pulse">
                    <i className="fa-solid fa-brain text-xl mr-3"></i> AI is analyzing post priorities...
                </div>
            )}

            <div className="space-y-3">
                {filteredPosts.map(post => (
                    <div key={post.id} className="bg-dark-900 border border-dark-800 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-start md:items-center hover:border-dark-700 transition-colors group">
                        
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                {post.priority === 'critical' && <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase animate-pulse">Critical</span>}
                                {post.priority === 'high' && <span className="bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase">High Priority</span>}
                                {post.postType === 'review' && <span className="bg-dark-800 text-gray-400 text-[10px] font-bold px-2 py-0.5 rounded uppercase border border-dark-700">Review</span>}
                                {post.postType === 'listicle' && <span className="bg-dark-800 text-gray-400 text-[10px] font-bold px-2 py-0.5 rounded uppercase border border-dark-700">Listicle</span>}
                            </div>
                            <h3 onClick={() => onPostSelect(post)} className="text-sm font-bold text-gray-200 cursor-pointer hover:text-brand-400 truncate">{post.title}</h3>
                            <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-xs text-dark-700 hover:text-brand-500 flex items-center gap-1 mt-1">
                                <i className="fa-solid fa-external-link-alt"></i> {post.url}
                            </a>
                        </div>

                        <div className="flex items-center gap-3 w-full md:w-auto">
                            {post.autoPilotStatus === 'found' && <span className="text-xs font-bold text-brand-400"><i className="fa-solid fa-check"></i> Product Found</span>}
                            {post.autoPilotStatus === 'published' && <span className="text-xs font-bold text-green-400"><i className="fa-solid fa-rocket"></i> Live</span>}
                            
                            <button onClick={() => onPostSelect(post)} className="flex-1 md:flex-none bg-white text-dark-950 font-bold text-xs px-4 py-2 rounded-lg hover:bg-gray-200 shadow-lg active:scale-95 transition-transform">
                                Fix Now
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {filteredPosts.length === 0 && (
                <div className="text-center py-20 text-gray-600">
                    <i className="fa-solid fa-folder-open text-4xl mb-4 opacity-50"></i>
                    <p>No posts found in this category.</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
