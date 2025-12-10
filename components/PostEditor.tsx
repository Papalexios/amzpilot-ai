
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { BlogPost, ProductDetails, InsertionMethod, AppConfig } from '../types';
import { generateProductBoxHtml, insertIntoContent, pushToWordPress, fetchRawPostContent, analyzeContentAndFindProduct } from '../utils';
import Toastify from 'toastify-js';

export const PostEditor: React.FC<{ post: BlogPost, config: AppConfig, onBack: () => void }> = ({ post, config, onBack }) => {
  const [product, setProduct] = useState<ProductDetails | null>(post.proposedProduct || null);
  const [content, setContent] = useState<string>(post.content || '');
  const [currentId, setCurrentId] = useState<number>(post.id); 
  const [insertion, setInsertion] = useState<InsertionMethod>('smart_middle');
  const [status, setStatus] = useState<'idle' | 'fetching' | 'analyzing' | 'pushing'>('idle');
  const [viewTab, setViewTab] = useState<'visual' | 'code' | 'schema'>('visual');
  const [manualMode, setManualMode] = useState(false);
  
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      if (manualMode) return;
      let isMounted = true;
      const init = async () => {
          let currentContent = post.content;
          // Auto-Hydrate if content is missing or ID is fake (0)
          if (!currentContent || currentContent.length < 50 || currentId < 100) {
              setStatus('fetching');
              try {
                  const result = await fetchRawPostContent(config, currentId, post.url);
                  if (isMounted) {
                      setContent(result.content);
                      setCurrentId(result.resolvedId);
                      currentContent = result.content;
                  }
              } catch (e: any) {
                  if (isMounted) {
                      Toastify({ text: "WP API Error. Switching to Manual Mode.", backgroundColor: "#f59e0b" }).showToast();
                      setManualMode(true); // Fallback
                  }
              }
          }
          if (!product && currentContent) {
              setStatus('analyzing');
              try {
                  const analysis = await analyzeContentAndFindProduct(post.title, currentContent, config);
                  if (isMounted && analysis.confidence > 50) setProduct(analysis.product);
              } catch (e) { console.error(e); }
          }
          if (isMounted) setStatus('idle');
      };
      init();
      return () => { isMounted = false; };
  }, [post.id, config, post.title, post.url]); 

  // Auto-scroll to preview
  useEffect(() => {
      if (product && previewRef.current) {
          setTimeout(() => previewRef.current?.scrollTo({ top: 400, behavior: 'smooth' }), 500);
      }
  }, [product]);

  const html = useMemo(() => {
     if (!product) return content;
     const box = generateProductBoxHtml(product, config.amazonTag, config.enableStickyBar);
     return insertIntoContent(content || '', box, insertion);
  }, [product, insertion, content, config.amazonTag, config.enableStickyBar]);

  const handlePush = async () => {
      setStatus('pushing');
      try {
          const link = await pushToWordPress(config, currentId, html); 
          Toastify({ text: "Published Successfully!", backgroundColor: "#10b981" }).showToast();
          window.open(link, '_blank');
      } catch(e: any) {
          Toastify({ text: "Error: " + e.message, backgroundColor: "#ef4444" }).showToast();
      } finally { setStatus('idle'); }
  };

  return (
    <div className="flex h-screen bg-dark-950 flex-col md:flex-row">
        <div className="w-full md:w-96 bg-dark-900 border-r border-dark-800 flex flex-col z-10 shadow-2xl h-1/2 md:h-full">
            <div className="p-4 border-b border-dark-800 flex items-center justify-between">
                <button onClick={onBack} className="text-gray-400 hover:text-white"><i className="fa-solid fa-arrow-left"></i> Back</button>
                <div className="text-xs font-bold text-gray-500">Editor v17.0</div>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto">
                {manualMode && (
                    <div className="mb-6 p-4 bg-yellow-900/20 border border-yellow-800 rounded-lg">
                        <label className="text-xs text-yellow-500 font-bold uppercase mb-2 block">Manual Mode Active</label>
                        <textarea value={content} onChange={e => setContent(e.target.value)} className="w-full bg-dark-950 border border-dark-700 rounded p-2 text-xs text-white" rows={6} placeholder="Paste your WP HTML source here..." />
                    </div>
                )}

                <div className="mb-6">
                    <h3 className="text-xs font-bold text-brand-500 uppercase mb-3">Product Intelligence</h3>
                    {!product ? (
                         <div className="text-center p-8 border border-dashed border-gray-700 rounded-xl bg-dark-950/50">
                            {status === 'analyzing' ? <i className="fa-solid fa-circle-notch fa-spin text-2xl text-brand-500"></i> : 
                            <button onClick={() => { setStatus('analyzing'); analyzeContentAndFindProduct(post.title, content, config).then(res => setProduct(res.product)).finally(() => setStatus('idle')); }} className="text-brand-400 text-sm font-bold hover:underline">Start Analysis</button>}
                         </div>
                    ) : (
                        <div className="space-y-4">
                            <input value={product.title} onChange={e => setProduct({...product, title: e.target.value})} className="w-full bg-dark-950 border border-dark-700 rounded p-2 text-sm text-white" />
                            <div className="flex gap-2">
                                <input value={product.price} onChange={e => setProduct({...product, price: e.target.value})} className="w-1/2 bg-dark-950 border border-dark-700 rounded p-2 text-sm text-white" />
                                <input value={product.asin} onChange={e => setProduct({...product, asin: e.target.value})} className="w-1/2 bg-dark-950 border border-dark-700 rounded p-2 text-sm text-white" placeholder="ASIN" />
                            </div>
                            <textarea value={product.verdict} onChange={e => setProduct({...product, verdict: e.target.value})} className="w-full bg-dark-950 border border-dark-700 rounded p-2 text-sm text-white" rows={3} />
                        </div>
                    )}
                </div>
                
                <div className="mb-6">
                     <h3 className="text-xs font-bold text-brand-500 uppercase mb-3">Placement</h3>
                     <div className="flex gap-2 flex-wrap">
                        {['top', 'smart_middle', 'bottom', 'after_h2'].map((m) => (
                            <button key={m} onClick={() => setInsertion(m as any)} className={`p-2 rounded text-[10px] font-bold border ${insertion === m ? 'bg-brand-600 border-brand-500 text-white' : 'bg-dark-950 border-dark-700 text-gray-500'}`}>{m.replace('_', ' ')}</button>
                        ))}
                     </div>
                </div>
            </div>

            <div className="p-4 bg-dark-900 border-t border-dark-800 space-y-3">
                <button onClick={handlePush} disabled={status !== 'idle'} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl shadow-lg flex items-center justify-center gap-2">
                    {status === 'pushing' ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-rocket"></i>}
                    <span>Update Live Post</span>
                </button>
                <button onClick={() => { if(product) navigator.clipboard.writeText(generateProductBoxHtml(product, config.amazonTag)); Toastify({ text: "Copied!", backgroundColor: "#8b5cf6" }).showToast(); }} className="w-full bg-dark-800 hover:bg-white hover:text-dark-900 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-2">
                    <i className="fa-regular fa-copy"></i> Copy HTML Code
                </button>
            </div>
        </div>

        <div className="flex-1 bg-gray-100 flex flex-col relative overflow-hidden h-1/2 md:h-full">
            <div className="absolute top-4 right-4 flex bg-white rounded-lg shadow p-1 z-20 gap-2">
                <div className="flex bg-gray-100 rounded p-1">
                    <button onClick={() => setViewTab('visual')} className={`px-3 py-1 text-xs font-bold rounded ${viewTab==='visual'?'bg-white shadow':''}`}>Visual</button>
                    <button onClick={() => setViewTab('code')} className={`px-3 py-1 text-xs font-bold rounded ${viewTab==='code'?'bg-white shadow':''}`}>Code</button>
                    <button onClick={() => setViewTab('schema')} className={`px-3 py-1 text-xs font-bold rounded ${viewTab==='schema'?'bg-white shadow':''}`}>SEO</button>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 md:p-10 flex justify-center items-start bg-gray-50" ref={previewRef}>
                <div className="bg-white shadow-2xl w-full max-w-[900px] rounded-xl min-h-[1200px] border border-gray-200">
                    {viewTab === 'visual' && <div className="p-8 prose max-w-none" dangerouslySetInnerHTML={{ __html: html }} />}
                    {viewTab === 'code' && <pre className="p-4 text-xs bg-gray-900 text-green-400 overflow-auto h-full">{html}</pre>}
                    {viewTab === 'schema' && (
                        <div className="p-8">
                            <h3 className="font-bold mb-4">JSON-LD (Google Rich Snippets)</h3>
                            <div className="bg-gray-100 p-4 rounded text-xs font-mono text-gray-700 whitespace-pre-wrap">
                                {product?.schema || 'No schema generated'}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};
