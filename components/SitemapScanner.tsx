import React, { useState, useMemo, useRef, useEffect } from 'react';
import { BlogPost, SitemapState, AppConfig } from '../types';
import { fetchAndParseSitemap, fetchPageContent, checkForAffiliateLinks, runConcurrent, analyzeContentAndFindProduct, generateProductBoxHtml, insertIntoContent, pushToWordPress } from '../utils';
import Toastify from 'toastify-js';

interface SitemapScannerProps {
  onPostSelect: (post: BlogPost) => void;
  savedState: SitemapState;
  onStateChange: (state: SitemapState) => void;
  config: AppConfig;
}

export const SitemapScanner: React.FC<SitemapScannerProps> = ({ onPostSelect, savedState, onStateChange, config }) => {
  const [sitemapUrl, setSitemapUrl] = useState(savedState.url || '');
  const [status, setStatus] = useState<'idle' | 'scanning' | 'processing'>('idle');
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
          ...p, status: 'publish', monetizationStatus: 'opportunity', autoPilotStatus: 'idle', content: '' 
      }));
      onStateChange({ url: sitemapUrl, posts: initialPosts, lastScanned: Date.now() });
      Toastify({ text: `Synced ${posts.length} posts`, backgroundColor: "#10b981" }).showToast();
    } catch (e) {
      Toastify({ text: "Sitemap connection failed. Check URL.", backgroundColor: "#ef4444" }).showToast();
    } finally {
      setStatus('idle');
    }
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
    const targets = savedState.posts.filter(p => p.monetizationStatus === 'opportunity' && p.autoPilotStatus !== 'published');
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

            const page = await fetchPageContent(post.url);
            if (checkForAffiliateLinks(page.content)) {
                postMap.set(post.url, { ...post, monetizationStatus: 'monetized', autoPilotStatus: 'idle' });
                return;
            }

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

  const stats = useMemo(() => ({
      total: savedState.posts.length,
      opportunities: savedState.posts.filter(p => p.monetizationStatus === 'opportunity').length,
      monetized: savedState.posts.filter(p => p.monetizationStatus === 'monetized').length
  }), [savedState.posts]);

  return (
    <div className="flex flex-col h-full bg-dark-950 md:flex-row relative">
      
      {/* Mobile Sticky HUD Header */}
      <div className="md:hidden sticky top-0 z-30 bg-dark-950/80 backdrop-blur-xl border-b border-dark-800 p-4">
        <div className="flex items-center justify-between mb-4">
           <h1 className="text-xl font-black text-white tracking-tight">Amz<span className="text-brand-500">Pilot</span></h1>
           <div className="flex gap-2">
                <button onClick={() => setIsFullyAuto(!isFullyAuto)} className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${isFullyAuto ? 'border-green-500 text-green-500 bg-green-500/10' : 'border-dark-700 text-gray-500'}`}>
                    Auto: {isFullyAuto ? 'ON' : 'OFF'}
                </button>
           </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
            <div className="bg-dark-900 rounded p-2 text-center border border-dark-800">
                <div className="text-[10px] text-gray-500 uppercase font-bold">Total</div>
                <div className="text-sm font-black text-white">{stats.total}</div>
            </div>
            <div className="bg-yellow-900/10 rounded p-2 text-center border border-yellow-900/30">
                <div className="text-[10px] text-yellow-500 uppercase font-bold">Needs Links</div>
                <div className="text-sm font-black text-white">{stats.opportunities}</div>
            </div>
            <div className="bg-green-900/10 rounded p-2 text-center border border-green-900/30">
                <div className="text-[10px] text-green-500 uppercase font-bold">Done</div>
                <div className="text-sm font-black text-white">{stats.monetized}</div>
            </div>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-64 bg-dark-900 border-r border-dark-800 flex-col p-6 z-10 relative">
          <div className="flex justify-between items-center mb-8">
             <h1 className="text-2xl font-black text-white">Amz<span className="text-brand-500">Pilot</span></h1>
          </div>
          
          <div className="space-y-4">
              <div className="bg-dark-950 p-4 rounded-xl border border-dark-800">
                  <div className="text-xs text-gray-500 uppercase font-bold">Total</div>
                  <div className="text-2xl font-black text-white">{stats.total}</div>
              </div>
              <div className="bg-dark-950 p-4 rounded-xl border border-yellow-900/30">
                  <div className="text-xs text-yellow-500 uppercase font-bold">Opportunities</div>
                  <div className="text-2xl font-black text-white">{stats.opportunities}</div>
              </div>
          </div>
          
          <button onClick={handleReset} className="mt-auto text-xs text-red-500 hover:text-red-400 font-bold border border-red-900/50 rounded-lg py-3 hover:bg-red-900/20 transition-all">
             <i className="fa-solid fa-trash mr-2"></i> Wipe Data
          </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Command Bar */}
        <div className="bg-dark-900/50 backdrop-blur-md border-b border-dark-800 p-4 flex flex-col md:flex-row gap-4 items-center z-20">
             <form onSubmit={handleFetchSitemap} className="w-full flex gap-2">
                <input type="url" value={sitemapUrl} onChange={e => setSitemapUrl(e.target.value)} placeholder="https://yoursite.com/post-sitemap.xml" className="flex-1 bg-dark-950 border border-dark-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-500 outline-none text-sm font-mono min-w-0 shadow-inner" />
                <button type="submit" disabled={status !== 'idle'} className="bg-white text-dark-900 font-bold px-6 rounded-xl hover:bg-gray-200 whitespace-nowrap active:scale-95 transition-transform">{status === 'scanning' ? '...' : 'Sync'}</button>
             </form>
             <button onClick={status === 'processing' ? () => setStopSignal(true) : runAutonomousPipeline} className={`w-full md:w-auto px-6 py-3 rounded-xl font-bold text-white shadow-lg whitespace-nowrap active:scale-95 transition-transform ${status === 'processing' ? 'bg-red-600' : 'bg-brand-600 hover:bg-brand-500'}`}>
                {status === 'processing' ? 'STOP' : 'RUN AUTO-PILOT'}
             </button>
        </div>

        {/* Scrollable Grid */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-32 md:pb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {savedState.posts.map(post => (
                    <div key={post.id} onClick={() => onPostSelect(post)} className="bg-dark-900/40 backdrop-blur border border-dark-800 rounded-xl p-5 group relative cursor-pointer active:scale-[0.98] transition-all hover:bg-dark-800 hover:border-brand-500/30 shadow-lg">
                        <div className="flex justify-between items-start mb-2">
                            <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${post.monetizationStatus === 'monetized' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-500'}`}>
                                {post.monetizationStatus === 'opportunity' ? 'Needs Links' : post.monetizationStatus}
                            </span>
                            {post.aiConfidence && <span className="text-brand-400 text-xs font-bold">{post.aiConfidence}%</span>}
                        </div>
                        <h3 className="font-bold text-gray-200 text-sm mb-4 line-clamp-2 leading-relaxed" title={post.title}>{post.title}</h3>
                        <div className="flex items-center text-xs font-bold text-gray-500 group-hover:text-brand-400 transition-colors">
                            {post.monetizationStatus === 'monetized' ? 'Edit Box' : 'Monetize Now'} <i className="fa-solid fa-arrow-right ml-2"></i>
                        </div>
                    </div>
                ))}
            </div>
            
            {savedState.posts.length === 0 && (
                <div className="flex flex-col items-center justify-center h-64 text-gray-600">
                    <i className="fa-solid fa-robot text-4xl mb-4 text-dark-800"></i>
                    <p className="text-sm">Enter sitemap to start scanning</p>
                </div>
            )}
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 w-full bg-dark-900/90 backdrop-blur-xl border-t border-dark-800 p-2 flex justify-around z-50 pb-safe">
          <button className="flex flex-col items-center p-2 text-brand-500">
              <i className="fa-solid fa-radar text-xl mb-1"></i>
              <span className="text-[10px] font-bold">Scan</span>
          </button>
          <button onClick={handleReset} className="flex flex-col items-center p-2 text-gray-500 hover:text-red-500">
              <i className="fa-solid fa-trash text-xl mb-1"></i>
              <span className="text-[10px] font-bold">Reset</span>
          </button>
      </div>
    </div>
  );
};