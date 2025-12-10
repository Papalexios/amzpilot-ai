
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
  
  // Throttled State Ref for High-Frequency Updates
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

  const runAutonomousPipeline = async () => {
    if (!config.wpUrl) return Toastify({ text: "Configure WP first", backgroundColor: "#f59e0b" }).showToast();
    
    setStopSignal(false);
    setStatus('processing');
    const targets = savedState.posts.filter(p => p.monetizationStatus === 'opportunity' && p.autoPilotStatus !== 'published');
    const postMap = new Map(savedState.posts.map(p => [p.url, p]));

    // Update UI Throttler
    let updateTimer: any = null;
    const triggerUIUpdate = () => {
        if (updateTimer) return;
        updateTimer = setTimeout(() => {
            onStateChange({ ...stateRef.current, posts: Array.from(postMap.values()) });
            updateTimer = null;
        }, 500); // 2fps updates to prevent lag
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
    <div className="flex min-h-screen bg-dark-950">
      <div className="w-64 bg-dark-900 border-r border-dark-800 hidden md:flex flex-col p-6 fixed h-full z-10 backdrop-blur-sm">
          <div className="mb-8"><h1 className="text-2xl font-black text-white">Amz<span className="text-brand-500">Auto</span></h1></div>
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
      </div>

      <div className="flex-1 md:ml-64 p-8 overflow-y-auto">
        <div className="bg-dark-900 border border-dark-800 rounded-2xl p-4 mb-8 flex gap-4 items-center justify-between shadow-xl sticky top-0 z-20 backdrop-blur-md bg-opacity-90">
             <form onSubmit={handleFetchSitemap} className="flex-1 flex gap-2">
                <input type="url" value={sitemapUrl} onChange={e => setSitemapUrl(e.target.value)} placeholder="https://yoursite.com/post-sitemap.xml" className="flex-1 bg-dark-950 border border-dark-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-500 outline-none text-sm font-mono" />
                <button type="submit" disabled={status !== 'idle'} className="bg-white text-dark-900 font-bold px-6 rounded-xl hover:bg-gray-200">{status === 'scanning' ? 'Scanning...' : 'Sync'}</button>
             </form>
             <div className="flex items-center gap-2 border-l border-dark-700 pl-4">
                 <button onClick={() => setIsFullyAuto(!isFullyAuto)} className={`px-3 py-2 rounded text-xs font-bold ${isFullyAuto ? 'bg-green-500 text-black' : 'bg-dark-800 text-gray-500'}`}>Auto-Publish: {isFullyAuto ? 'ON' : 'OFF'}</button>
                 <button onClick={status === 'processing' ? () => setStopSignal(true) : runAutonomousPipeline} className={`px-6 py-3 rounded-xl font-bold text-white shadow-lg ${status === 'processing' ? 'bg-red-600' : 'bg-brand-600 hover:bg-brand-500'}`}>
                    {status === 'processing' ? 'STOP' : 'RUN AUTO-PILOT'}
                 </button>
             </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-24">
             {savedState.posts.map(post => (
                 <div key={post.id} className="bg-dark-900/50 border border-dark-800 hover:border-dark-600 rounded-xl p-5 group relative">
                     <div className="flex justify-between items-start mb-2">
                         <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${post.monetizationStatus === 'monetized' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-500'}`}>
                             {post.monetizationStatus === 'opportunity' ? 'Needs Links' : post.monetizationStatus}
                         </span>
                         {post.aiConfidence && <span className="text-brand-400 text-xs font-bold">{post.aiConfidence}%</span>}
                     </div>
                     <h3 className="font-bold text-gray-200 text-sm mb-4 line-clamp-2" title={post.title}>{post.title}</h3>
                     <button onClick={() => onPostSelect(post)} className={`w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 ${post.monetizationStatus === 'monetized' ? 'bg-dark-800 text-gray-400' : 'bg-brand-600 text-white'}`}>
                         {post.monetizationStatus === 'monetized' ? 'Edit Box' : 'Monetize Now'} <i className="fa-solid fa-arrow-right"></i>
                     </button>
                 </div>
             ))}
        </div>
      </div>
    </div>
  );
};
