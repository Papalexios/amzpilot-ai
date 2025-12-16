
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { BlogPost, ProductDetails, InsertionMethod, AppConfig } from '../types';
import { generateProductBoxHtml, insertIntoContent, pushToWordPress, fetchRawPostContent, analyzeContentAndFindProduct } from '../utils';
import Toastify from 'toastify-js';

interface PostEditorProps {
    post: BlogPost;
    config: AppConfig;
    onBack: () => void;
    allPosts?: BlogPost[];
    onSwitchPost?: (post: BlogPost) => void;
}

export const PostEditor: React.FC<PostEditorProps> = ({ post, config, onBack, allPosts, onSwitchPost }) => {
  const [product, setProduct] = useState<ProductDetails | null>(post.proposedProduct || null);
  const [detectedProducts, setDetectedProducts] = useState<ProductDetails[]>(post.detectedProducts || []);
  const [rawContent, setRawContent] = useState<string>(''); // Pure content WITHOUT the box
  const [currentId, setCurrentId] = useState<number>(post.id); 
  const [insertion, setInsertion] = useState<InsertionMethod>('smart_middle');
  const [status, setStatus] = useState<'idle' | 'fetching' | 'searching' | 'analyzing' | 'pushing'>('idle');
  const [viewTab, setViewTab] = useState<'visual' | 'code'>('visual');
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit');
  const [showNav, setShowNav] = useState(false);
  const [featuredImage, setFeaturedImage] = useState<string>('');

  // Manual Overrides
  const [manualAsin, setManualAsin] = useState('');
  const [manualImage, setManualImage] = useState('');
  
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      // Reset state when post changes
      setProduct(post.proposedProduct || null);
      setDetectedProducts(post.detectedProducts || []);
      setManualAsin('');
      setManualImage('');
      setRawContent('');
      setCurrentId(post.id);
      setFeaturedImage('');
      
      let isMounted = true;
      const init = async () => {
          setStatus('fetching');
          try {
              const result = await fetchRawPostContent(config, post.id, post.url);
              if (isMounted) {
                  // CLEAN IT IMMEDIATELY
                  // We remove any existing amz-sota-box so we start fresh
                  const clean = result.content.replace(/<!-- wp:html -->\s*<div id="amz-.*?" class="amz-sota-box[\s\S]*?<\/div>\s*<!-- \/wp:html -->/g, '')
                                              .replace(/<div id="amz-.*?" class="amz-sota-box[\s\S]*?<\/div>/g, '');
                  
                  setRawContent(clean);
                  setCurrentId(result.resolvedId);
                  if (result.featuredImage) {
                      setFeaturedImage(result.featuredImage);
                  }
                  
                  if (!post.proposedProduct && result.content && detectedProducts.length === 0) {
                      setStatus('searching');
                      const analysis = await analyzeContentAndFindProduct(
                          result.title, 
                          clean, 
                          config, 
                          { fallbackImage: result.featuredImage }
                      );
                      setProduct(analysis.product);
                      if (analysis.product.asin) setManualAsin(analysis.product.asin);
                  }
              }
          } catch (e: any) {
              if (isMounted) {
                  Toastify({ text: "API Error. Using Cached/Scraped Content.", backgroundColor: "#f59e0b" }).showToast();
                  // Fallback cleaning
                  const clean = (post.content || '').replace(/<!-- wp:html -->\s*<div id="amz-.*?" class="amz-sota-box[\s\S]*?<\/div>\s*<!-- \/wp:html -->/g, '')
                                                      .replace(/<div id="amz-.*?" class="amz-sota-box[\s\S]*?<\/div>/g, '');
                  setRawContent(clean);
              }
          } finally {
              if (isMounted) setStatus('idle');
          }
      };
      init();
      return () => { isMounted = false; };
  }, [post.id, post.url]); 

  const runAnalysis = async (mode: 'single' | 'multi' = 'single') => {
      if (!config.aiApiKey && !manualAsin) return Toastify({ text: "Missing AI API Key", backgroundColor: "#ef4444" }).showToast();
      
      setStatus('analyzing');
      try {
          const res = await analyzeContentAndFindProduct(post.title, rawContent, config, { 
              mode, 
              manualAsin: manualAsin.trim(), 
              manualImage: manualImage.trim(),
              fallbackImage: featuredImage
          });
          if (mode === 'single') {
              setProduct(res.product);
              if (manualAsin && res.product.asin === manualAsin) Toastify({ text: "ASIN Data Synced", backgroundColor: "#10b981" }).showToast();
          } else {
              setDetectedProducts(res.detectedProducts);
              if (res.detectedProducts.length > 0) setProduct(res.detectedProducts[0]);
              Toastify({ text: `Found ${res.detectedProducts.length} products!`, backgroundColor: "#10b981" }).showToast();
          }
      } catch(e) { console.error(e); Toastify({ text: "Analysis Failed", backgroundColor: "#ef4444" }).showToast(); }
      setStatus('idle');
  };

  const handleApplyImage = () => {
      if (!manualImage) return;
      if (product) {
          // MERGE state, do not overwrite
          setProduct(prev => ({ ...prev!, imageUrl: manualImage }));
          Toastify({ text: "Image Override Applied", backgroundColor: "#10b981" }).showToast();
      } else {
          setProduct({
              asin: manualAsin,
              title: "Manual Product",
              price: "Check Price",
              rating: 5,
              prime: true,
              imageUrl: manualImage,
              verdict: "Manual Override",
              pros: [], cons: [], specs: {}
          });
      }
  };

  const clearProduct = () => {
      setProduct(null);
      Toastify({ text: "Product Box Removed", backgroundColor: "#f59e0b" }).showToast();
  };

  // Computed HTML: Always takes Raw Content + inserts ONE box based on current product state
  const html = useMemo(() => {
     if (!product) return rawContent;
     const box = generateProductBoxHtml(product, config.amazonTag, config.enableStickyBar);
     return insertIntoContent(rawContent || '', box, insertion, product.contextSnippet);
  }, [product, insertion, rawContent, config.amazonTag, config.enableStickyBar]);

  const handlePush = async () => {
      setStatus('pushing');
      try {
          const link = await pushToWordPress(config, currentId, html); 
          Toastify({ text: "Published Successfully!", backgroundColor: "#10b981" }).showToast();
          window.open(link, '_blank');
      } catch(e: any) {
          Toastify({ text: e.message, backgroundColor: "#ef4444" }).showToast();
      } finally { setStatus('idle'); }
  };

  return (
    <div className="flex h-full bg-dark-950 flex-col md:flex-row overflow-hidden relative">
        
        {/* Post Navigator Slide-out */}
        <div className={`absolute top-0 left-0 bottom-0 z-50 bg-dark-900 w-72 shadow-2xl transform transition-transform duration-300 border-r border-dark-700 ${showNav ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="p-4 border-b border-dark-800 flex justify-between items-center">
                <span className="text-white font-bold">Post Navigator</span>
                <button onClick={() => setShowNav(false)}><i className="fa-solid fa-times text-gray-500 hover:text-white"></i></button>
            </div>
            <div className="overflow-y-auto h-full pb-20">
                {allPosts?.map(p => (
                    <div key={p.id} onClick={() => { onSwitchPost?.(p); setShowNav(false); }} className={`p-4 border-b border-dark-800 cursor-pointer hover:bg-dark-800 transition-colors ${p.id === post.id ? 'bg-brand-900/20 border-l-4 border-brand-500' : ''}`}>
                        <div className="flex items-center gap-2 mb-1">
                             {p.priority === 'critical' && <span className="w-2 h-2 rounded-full bg-red-500"></span>}
                             <div className={`text-[10px] uppercase font-bold ${p.monetizationStatus === 'monetized' ? 'text-green-500' : 'text-yellow-500'}`}>{p.monetizationStatus}</div>
                        </div>
                        <div className="text-xs text-white line-clamp-2">{p.title}</div>
                    </div>
                ))}
            </div>
        </div>

        {/* Mobile Tab Switcher */}
        <div className="md:hidden flex border-b border-dark-800 bg-dark-900 z-30">
            <button onClick={() => setMobileTab('edit')} className={`flex-1 py-3 text-xs font-bold uppercase ${mobileTab === 'edit' ? 'text-brand-500 border-b-2 border-brand-500' : 'text-gray-500'}`}>Edit</button>
            <button onClick={() => setMobileTab('preview')} className={`flex-1 py-3 text-xs font-bold uppercase ${mobileTab === 'preview' ? 'text-brand-500 border-b-2 border-brand-500' : 'text-gray-500'}`}>Preview</button>
        </div>

        {/* Editor Pane (Left) */}
        <div className={`${mobileTab === 'edit' ? 'flex' : 'hidden'} md:flex w-full md:w-96 bg-dark-900 border-r border-dark-800 flex-col z-10 shadow-2xl h-full overflow-hidden`}>
            <div className="p-4 border-b border-dark-800 flex items-center gap-3 shrink-0">
                <button onClick={() => setShowNav(true)} className="md:hidden text-gray-400 hover:text-white"><i className="fa-solid fa-bars"></i></button>
                <button onClick={onBack} className="text-gray-400 hover:text-white flex items-center gap-2 text-sm font-bold"><i className="fa-solid fa-arrow-left"></i> Back</button>
                <div className="flex-1"></div>
                {allPosts && (
                    <button onClick={() => setShowNav(!showNav)} className="hidden md:block text-xs text-brand-500 font-bold border border-brand-500/30 px-2 py-1 rounded hover:bg-brand-500/10">
                        <i className="fa-solid fa-list mr-1"></i> Posts
                    </button>
                )}
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto pb-32 space-y-6">
                
                {/* Manual Override Section */}
                <div className="bg-dark-950 p-4 rounded-xl border border-dark-700 space-y-3 relative overflow-visible">
                    <div className="flex justify-between items-center">
                        <h3 className="text-xs font-bold text-gray-400 uppercase">Manual Override</h3>
                        {product && (
                            <button onClick={clearProduct} className="text-[10px] text-red-500 font-bold hover:text-red-400 flex items-center gap-1">
                                <i className="fa-solid fa-trash"></i> Remove Product
                            </button>
                        )}
                    </div>
                    
                    {/* ASIN Input */}
                    <div className="flex gap-2">
                        <input value={manualAsin} onChange={e => setManualAsin(e.target.value)} placeholder="ASIN (B0...)" className="flex-1 bg-dark-900 border border-dark-700 rounded p-2 text-xs text-white font-mono focus:border-brand-500 outline-none" />
                        <button onClick={() => runAnalysis('single')} className="bg-brand-600 px-4 rounded text-white hover:bg-brand-500 shadow-lg font-bold text-xs whitespace-nowrap">
                            FETCH
                        </button>
                    </div>

                    {/* Image Input */}
                    <div className="flex gap-2">
                        <input value={manualImage} onChange={e => setManualImage(e.target.value)} placeholder="Force Image URL (Instant)" className="flex-1 bg-dark-900 border border-dark-700 rounded p-2 text-xs text-white focus:border-brand-500 outline-none" />
                        <button onClick={handleApplyImage} className="bg-gray-700 px-4 rounded text-white hover:bg-gray-600 shadow-lg font-bold text-xs whitespace-nowrap">
                            SET
                        </button>
                    </div>
                </div>

                {/* Intelligence Control */}
                <div>
                    <h3 className="text-xs font-bold text-brand-500 uppercase mb-3">Product Intelligence</h3>
                    
                    <div className="flex gap-2 mb-4">
                        <button onClick={() => runAnalysis('single')} disabled={status === 'analyzing'} className="flex-1 bg-dark-800 py-2 rounded-lg text-xs font-bold text-gray-300 hover:bg-dark-700 border border-dark-700">
                             Single Product
                        </button>
                        <button onClick={() => runAnalysis('multi')} disabled={status === 'analyzing'} className="flex-1 bg-purple-900/30 py-2 rounded-lg text-xs font-bold text-purple-300 hover:bg-purple-900/50 border border-purple-800">
                             <i className="fa-solid fa-layer-group mr-1"></i> Deep Scan
                        </button>
                    </div>

                    {status === 'analyzing' || status === 'searching' ? (
                        <div className="text-center p-8 bg-dark-950/50 rounded-xl">
                            <i className="fa-solid fa-circle-notch fa-spin text-2xl text-brand-500 mb-2"></i>
                            <div className="text-xs text-gray-400 animate-pulse">Consulting AI & Google...</div>
                        </div>
                    ) : detectedProducts.length > 0 ? (
                        <div className="space-y-2">
                            <label className="text-xs text-gray-500">Detected Products</label>
                            {detectedProducts.map((p, i) => (
                                <div key={i} onClick={() => setProduct(p)} className={`p-3 rounded-lg border cursor-pointer flex items-center gap-3 ${product?.asin === p.asin ? 'bg-brand-900/20 border-brand-500' : 'bg-dark-950 border-dark-700'}`}>
                                    <img src={p.imageUrl} className="w-8 h-8 object-contain bg-white rounded" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-bold text-white truncate">{p.title}</div>
                                        <div className="text-[10px] text-gray-500">{p.price}</div>
                                    </div>
                                    {product?.asin === p.asin && <i className="fa-solid fa-check text-brand-500"></i>}
                                </div>
                            ))}
                        </div>
                    ) : product ? (
                        <div className="space-y-4 animate-fade-in">
                            <div>
                                <label className="text-[10px] text-gray-500 uppercase font-bold">Title</label>
                                <input value={product.title} onChange={e => setProduct({...product!, title: e.target.value})} className="w-full bg-dark-950 border border-dark-700 rounded-xl p-3 text-sm text-white focus:border-brand-500 outline-none" />
                            </div>
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <label className="text-[10px] text-gray-500 uppercase font-bold">Price</label>
                                    <input value={product.price} onChange={e => setProduct({...product!, price: e.target.value})} className="w-full bg-dark-950 border border-dark-700 rounded-xl p-3 text-sm text-white" />
                                </div>
                                <div className="flex-1">
                                    <label className="text-[10px] text-gray-500 uppercase font-bold">ASIN</label>
                                    <input value={product.asin} readOnly className="w-full bg-dark-950 border border-dark-700 rounded-xl p-3 text-sm text-gray-500 font-mono" />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center text-xs text-gray-500 p-4">No product selected.</div>
                    )}
                </div>
                
                <div className="mb-6">
                     <h3 className="text-xs font-bold text-brand-500 uppercase mb-3">Insertion Strategy</h3>
                     <div className="grid grid-cols-2 gap-2">
                        {['top', 'smart_middle', 'bottom', 'after_h2', 'context_match'].map((m) => (
                            <button key={m} onClick={() => setInsertion(m as any)} className={`p-3 rounded-xl text-xs font-bold border transition-all active:scale-95 ${insertion === m ? 'bg-brand-600 border-brand-500 text-white' : 'bg-dark-950 border-dark-700 text-gray-500'}`}>
                                {m === 'context_match' ? 'Smart Context' : m.replace('_', ' ')}
                            </button>
                        ))}
                     </div>
                </div>
            </div>

            <div className="p-4 bg-dark-900 border-t border-dark-800 space-y-3 shrink-0 pb-safe">
                <button onClick={handlePush} disabled={status !== 'idle'} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform">
                    {status === 'pushing' ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-rocket"></i>}
                    <span>Update Live Post</span>
                </button>
            </div>
        </div>

        {/* Preview Pane (Right) */}
        <div className={`${mobileTab === 'preview' ? 'flex' : 'hidden'} md:flex flex-1 bg-gray-100 flex-col relative overflow-hidden h-full`}>
            {/* View Toggle */}
            <div className="absolute top-6 right-6 flex bg-white rounded-lg shadow-sm border border-gray-200 p-1 z-20 gap-1">
                <button onClick={() => setViewTab('visual')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${viewTab==='visual'?'bg-brand-50 text-brand-600':'text-gray-500 hover:text-gray-700'}`}>
                    <i className="fa-solid fa-eye mr-2"></i> Visual
                </button>
                <button onClick={() => setViewTab('code')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${viewTab==='code'?'bg-brand-50 text-brand-600':'text-gray-500 hover:text-gray-700'}`}>
                    <i className="fa-solid fa-code mr-2"></i> Source
                </button>
            </div>
            
            {/* Canvas */}
            <div className="flex-1 overflow-y-auto p-4 md:p-10 flex justify-center items-start bg-[#f3f4f6]" ref={previewRef}>
                <div className="bg-white shadow-xl w-full max-w-[900px] min-h-[1000px] border border-gray-200 rounded-none md:rounded-lg overflow-hidden relative">
                    {/* Fake Browser Header for aesthetics */}
                    <div className="h-6 bg-gray-100 border-b border-gray-200 flex items-center px-4 gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400"></div>
                        <div className="w-2.5 h-2.5 rounded-full bg-green-400"></div>
                    </div>
                    
                    {viewTab === 'visual' && (
                        <div className="p-8 md:p-12 relative">
                             {/* Loading Overlay */}
                             {status === 'fetching' && (
                                 <div className="absolute inset-0 bg-white/90 z-20 flex flex-col items-center justify-center">
                                     <i className="fa-solid fa-circle-notch fa-spin text-4xl text-brand-500 mb-4"></i>
                                     <div className="text-sm font-bold text-gray-600 uppercase tracking-widest">Rendering Content...</div>
                                 </div>
                             )}

                             {/* Typography Prose Class to mimic WordPress Theme perfectly */}
                             <div className="prose prose-slate prose-lg max-w-none prose-headings:font-black prose-a:text-brand-600 prose-img:rounded-xl" dangerouslySetInnerHTML={{ __html: html }} />
                        </div>
                    )}
                    
                    {viewTab === 'code' && (
                        <pre className="p-4 text-xs bg-[#1e1e1e] text-[#d4d4d4] overflow-auto h-full font-mono leading-relaxed" style={{tabSize: 2}}>
                            {html}
                        </pre>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};
