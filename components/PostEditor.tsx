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
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit');
  
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      if (manualMode) return;
      let isMounted = true;
      const init = async () => {
          let currentContent = post.content;
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
                      Toastify({ text: "API Error. Manual Mode.", backgroundColor: "#f59e0b" }).showToast();
                      setManualMode(true);
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

  const html = useMemo(() => {
     if (!product) return content;
     const box = generateProductBoxHtml(product, config.amazonTag, config.enableStickyBar);
     return insertIntoContent(content || '', box, insertion);
  }, [product, insertion, content, config.amazonTag, config.enableStickyBar]);

  const handlePush = async () => {
      setStatus('pushing');
      try {
          const link = await pushToWordPress(config, currentId, html); 
          Toastify({ text: "Published!", backgroundColor: "#10b981" }).showToast();
          window.open(link, '_blank');
      } catch(e: any) {
          Toastify({ text: e.message, backgroundColor: "#ef4444" }).showToast();
      } finally { setStatus('idle'); }
  };

  return (
    <div className="flex h-full bg-dark-950 flex-col md:flex-row overflow-hidden">
        
        {/* Mobile Tab Switcher */}
        <div className="md:hidden flex border-b border-dark-800 bg-dark-900 z-30">
            <button onClick={() => setMobileTab('edit')} className={`flex-1 py-3 text-xs font-bold uppercase ${mobileTab === 'edit' ? 'text-brand-500 border-b-2 border-brand-500' : 'text-gray-500'}`}>
                Edit
            </button>
            <button onClick={() => setMobileTab('preview')} className={`flex-1 py-3 text-xs font-bold uppercase ${mobileTab === 'preview' ? 'text-brand-500 border-b-2 border-brand-500' : 'text-gray-500'}`}>
                Preview
            </button>
        </div>

        {/* Editor Pane */}
        <div className={`${mobileTab === 'edit' ? 'flex' : 'hidden'} md:flex w-full md:w-96 bg-dark-900 border-r border-dark-800 flex-col z-10 shadow-2xl h-full overflow-hidden`}>
            <div className="p-4 border-b border-dark-800 flex items-center justify-between shrink-0">
                <button onClick={onBack} className="text-gray-400 hover:text-white flex items-center gap-2"><i className="fa-solid fa-arrow-left"></i> Back</button>
                <div className="text-xs font-bold text-gray-500">Editor v18</div>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto pb-32">
                {manualMode && (
                    <div className="mb-6 p-4 bg-yellow-900/20 border border-yellow-800 rounded-lg">
                        <textarea value={content} onChange={e => setContent(e.target.value)} className="w-full bg-dark-950 border border-dark-700 rounded p-3 text-xs text-white" rows={6} placeholder="Paste WP HTML..." />
                    </div>
                )}

                <div className="mb-6">
                    <h3 className="text-xs font-bold text-brand-500 uppercase mb-3">Product</h3>
                    {!product ? (
                         <div className="text-center p-8 border border-dashed border-gray-700 rounded-xl bg-dark-950/50">
                            {status === 'analyzing' ? <i className="fa-solid fa-circle-notch fa-spin text-2xl text-brand-500"></i> : 
                            <button onClick={() => { setStatus('analyzing'); analyzeContentAndFindProduct(post.title, content, config).then(res => setProduct(res.product)).finally(() => setStatus('idle')); }} className="w-full bg-dark-800 py-3 rounded-lg text-brand-400 font-bold">Start AI Analysis</button>}
                         </div>
                    ) : (
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] text-gray-500 uppercase font-bold">Product Title</label>
                                <input value={product.title} onChange={e => setProduct({...product, title: e.target.value})} className="w-full bg-dark-950 border border-dark-700 rounded-xl p-3 text-sm text-white" />
                            </div>
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <label className="text-[10px] text-gray-500 uppercase font-bold">Price</label>
                                    <input value={product.price} onChange={e => setProduct({...product, price: e.target.value})} className="w-full bg-dark-950 border border-dark-700 rounded-xl p-3 text-sm text-white" />
                                </div>
                                <div className="flex-1">
                                    <label className="text-[10px] text-gray-500 uppercase font-bold">ASIN</label>
                                    <input value={product.asin} onChange={e => setProduct({...product, asin: e.target.value})} className="w-full bg-dark-950 border border-dark-700 rounded-xl p-3 text-sm text-white font-mono" />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] text-gray-500 uppercase font-bold">Verdict</label>
                                <textarea value={product.verdict} onChange={e => setProduct({...product, verdict: e.target.value})} className="w-full bg-dark-950 border border-dark-700 rounded-xl p-3 text-sm text-white" rows={3} />
                            </div>
                        </div>
                    )}
                </div>
                
                <div className="mb-6">
                     <h3 className="text-xs font-bold text-brand-500 uppercase mb-3">Placement</h3>
                     <div className="grid grid-cols-2 gap-2">
                        {['top', 'smart_middle', 'bottom', 'after_h2'].map((m) => (
                            <button key={m} onClick={() => setInsertion(m as any)} className={`p-3 rounded-xl text-xs font-bold border transition-all active:scale-95 ${insertion === m ? 'bg-brand-600 border-brand-500 text-white' : 'bg-dark-950 border-dark-700 text-gray-500'}`}>{m.replace('_', ' ')}</button>
                        ))}
                     </div>
                </div>
            </div>

            <div className="p-4 bg-dark-900 border-t border-dark-800 space-y-3 shrink-0 pb-safe">
                <button onClick={handlePush} disabled={status !== 'idle'} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform">
                    {status === 'pushing' ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-rocket"></i>}
                    <span>Update Live Post</span>
                </button>
                <button onClick={() => { if(product) navigator.clipboard.writeText(generateProductBoxHtml(product, config.amazonTag)); Toastify({ text: "Copied HTML", backgroundColor: "#8b5cf6" }).showToast(); }} className="w-full bg-dark-800 hover:bg-white hover:text-dark-900 text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2 active:scale-95 transition-transform">
                    <i className="fa-regular fa-copy"></i> Copy HTML
                </button>
            </div>
        </div>

        {/* Preview Pane */}
        <div className={`${mobileTab === 'preview' ? 'flex' : 'hidden'} md:flex flex-1 bg-gray-100 flex-col relative overflow-hidden h-full`}>
            <div className="absolute top-4 right-4 flex bg-white rounded-lg shadow p-1 z-20 gap-2">
                <div className="flex bg-gray-100 rounded p-1">
                    <button onClick={() => setViewTab('visual')} className={`px-3 py-1 text-xs font-bold rounded ${viewTab==='visual'?'bg-white shadow':''}`}>View</button>
                    <button onClick={() => setViewTab('code')} className={`px-3 py-1 text-xs font-bold rounded ${viewTab==='code'?'bg-white shadow':''}`}>Code</button>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 md:p-10 flex justify-center items-start bg-gray-50" ref={previewRef}>
                <div className="bg-white shadow-2xl w-full max-w-[900px] rounded-xl min-h-[600px] md:min-h-[1200px] border border-gray-200">
                    {viewTab === 'visual' && <div className="p-4 md:p-8 prose max-w-none" dangerouslySetInnerHTML={{ __html: html }} />}
                    {viewTab === 'code' && <pre className="p-4 text-xs bg-gray-900 text-green-400 overflow-auto h-full whitespace-pre-wrap">{html}</pre>}
                </div>
            </div>
        </div>
    </div>
  );
};