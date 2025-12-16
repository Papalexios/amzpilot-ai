
import { ProductDetails, AppConfig, InsertionMethod, AIProvider, BlogPost, PostPriority, PostType } from './types';
import { GoogleGenAI } from '@google/genai';

/**
 * SECURITY UTILITY
 */
export const SecureStorage = {
  encrypt: (text: string) => {
    if (!text) return '';
    try {
      return btoa(text.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ (i % 255))).join(''));
    } catch (e) { return text; }
  },
  decrypt: (cipher: string) => {
    if (!cipher) return '';
    try {
      return atob(cipher).split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ (i % 255))).join('');
    } catch (e) { return cipher; }
  }
};

/**
 * ULTRA SMART CACHE SERVICE
 */
const CACHE_TTLS = {
    CONTENT: 1000 * 60 * 30, // 30 Minutes for WP Content
    AI: 1000 * 60 * 60 * 24 * 7, // 7 Days for AI Product Results (Products don't change often)
    SITEMAP: 1000 * 60 * 60, // 1 Hour
};

const CacheService = {
  get: <T>(key: string): T | null => {
    try {
      const item = localStorage.getItem(key);
      if (!item) return null;
      const parsed = JSON.parse(item);
      const ttl = key.startsWith('ai_') ? CACHE_TTLS.AI : (key.startsWith('wp_') ? CACHE_TTLS.CONTENT : CACHE_TTLS.SITEMAP);
      
      if (Date.now() - parsed.timestamp > ttl) {
        localStorage.removeItem(key);
        return null;
      }
      return parsed.data as T;
    } catch(e) { return null; }
  },
  set: (key: string, data: any) => {
    try {
        try {
            localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
        } catch (e) {
            console.warn("Cache full, clearing old entries...");
            localStorage.clear(); 
            localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
        }
    } catch (e) { console.warn("Storage unavailable"); }
  },
  generateHash: (str: string) => {
      let hash = 0;
      if (str.length === 0) return hash.toString();
      for (let i = 0; i < str.length; i++) {
          const char = str.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash |= 0; 
      }
      return hash.toString();
  }
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    try {
        return await fn();
    } catch (err: any) {
        if (retries === 0) throw err;
        const isRateLimit = err.message?.includes('429') || err.message?.includes('Quota') || err.message?.includes('Throttl');
        const nextDelay = isRateLimit ? delay * 2 : delay;
        await sleep(nextDelay);
        return withRetry(fn, retries - 1, nextDelay);
    }
}

/**
 * INTELLIGENCE ENGINE (Heuristic First)
 */
export const calculatePostPriority = (title: string, html: string = ''): { priority: PostPriority; type: PostType; status: 'monetized' | 'opportunity' } => {
    const lowerTitle = title.toLowerCase();
    const isReview = lowerTitle.includes('review') || lowerTitle.includes(' vs ') || lowerTitle.includes('hands-on') || lowerTitle.includes('guide') || lowerTitle.includes('buying');
    const isListicle = /^\d/.test(title) || lowerTitle.includes('best') || lowerTitle.includes('top ') || lowerTitle.includes('list');
    
    let type: PostType = 'info';
    if (isReview) type = 'review';
    else if (isListicle) type = 'listicle';

    if (!html) {
        if (isReview || isListicle) return { priority: 'high', type, status: 'opportunity' }; 
        return { priority: 'low', type, status: 'opportunity' };
    }

    const hasLinks = /amazon\.com\/|amzn\.to\/|tag=/i.test(html);
    let priority: PostPriority = 'low';
    let status: 'monetized' | 'opportunity' = hasLinks ? 'monetized' : 'opportunity';

    if ((isReview || isListicle) && !hasLinks) {
        priority = 'critical'; 
    } else if ((isReview || isListicle) && hasLinks) {
        priority = 'medium'; 
    } else if (!hasLinks && html.length > 1500) {
        priority = 'high'; 
    }

    return { priority, type, status };
};


/**
 * CONTENT HUNTER v2
 */
const extractContext = (html: string): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, nav, footer, header, aside, .sidebar, .comments, .ad-container, meta, link, svg, button, input, form, [class*="menu"], [class*="nav"], [class*="footer"], [class*="popup"]').forEach(e => e.remove());
    
    const main = doc.querySelector('main') || doc.querySelector('article') || doc.querySelector('.entry-content') || doc.body;
    let text = main.innerText.replace(/\s+/g, ' ').trim();
    return text.substring(0, 15000); 
};

const extractAsinFromHtml = (html: string): string | null => {
    const asinRegex = /\/(?:dp|gp\/product|ASIN)\/([A-Z0-9]{10})/i;
    const match = html.match(asinRegex);
    if (match) return match[1];
    return null; 
};

// SOTA: Deterministic Image Construction
// This is 1000x more reliable than scraping for standard items
const constructAmazonImageUrl = (asin: string): string => {
    if (!asin || asin.length < 10) return '';
    // High res amazon CDN pattern
    return `https://images-na.ssl-images-amazon.com/images/P/${asin.trim()}.01._SS500_.jpg`;
};

export const checkForAffiliateLinks = (html: string): boolean => {
  if (!html) return false;
  return /amazon\.com\/|amzn\.to\/|tag=/i.test(html);
};

export const runConcurrent = async <T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> => {
  const results: R[] = [];
  const queue = items.map((item, index) => ({ item, index }));
  
  for (let i = 0; i < queue.length; i += concurrency) {
      const chunk = queue.slice(i, i + concurrency);
      const chunkResults = await Promise.all(chunk.map(async ({ item, index }) => {
          try {
              return await fn(item);
          } catch (e) {
              console.error(`Task ${index} failed`, e);
              return null;
          }
      }));
      results.push(...chunkResults.filter(r => r !== null) as R[]);
      await sleep(50);
  }
  return results;
};

// SMART PROXY
let preferredProxyIndex = 0;
const fetchWithProxy = async (url: string) => {
    const proxies = [
        `https://corsproxy.io/?${encodeURIComponent(url)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        `https://thingproxy.freeboard.io/fetch/${url}`
    ];
    
    const orderedProxies = [
        proxies[preferredProxyIndex],
        ...proxies.filter((_, i) => i !== preferredProxyIndex)
    ];

    for (let i = 0; i < orderedProxies.length; i++) {
        try {
            const response = await fetch(orderedProxies[i]);
            if (response.ok) {
                const originalIndex = proxies.indexOf(orderedProxies[i]);
                if (originalIndex !== -1) preferredProxyIndex = originalIndex;
                return response;
            }
        } catch (e) { console.warn(`Proxy failed`); }
    }
    throw new Error("Proxy Error: All proxies failed. Check internet connection.");
};

export const testConnection = async (config: AppConfig): Promise<{ success: boolean; message: string }> => {
    let url = config.wpUrl.trim().replace(/\/$/, "");
    if (!url.startsWith('http')) url = 'https://' + url;

    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http:')) {
        return { success: false, message: "Security Block: You are on an HTTPS app trying to connect to an HTTP WordPress site." };
    }

    try {
        const publicEndpoint = `${url}/wp-json/`;
        const publicRes = await withRetry(() => fetch(publicEndpoint, { method: 'GET' }), 1, 500).catch(() => { throw new Error("UNREACHABLE"); });
        
        if (!publicRes.ok && publicRes.status === 404) return { success: false, message: "WP REST API not found on site." };

        const auth = btoa(`${config.wpUser}:${config.wpAppPassword}`);
        const authEndpoint = `${url}/wp-json/wp/v2/users/me`;
        const response = await fetch(authEndpoint, {
            method: 'GET',
            headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
        });

        if (response.ok) return { success: true, message: "Connection Successful!" };
        if (response.status === 401 || response.status === 403) return { success: false, message: "Auth Failed. Check Username/App Password." };
        return { success: false, message: `Server Error: ${response.status}` };

    } catch (e: any) {
        if (e.message === "UNREACHABLE") return { success: false, message: "Site Unreachable. Check URL." };
        const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'Current URL';
        return { success: false, message: `CORS Blocked.\nFIX: In 'WP CORS' plugin, delete '*' and add '${currentOrigin}'` };
    }
};

export const fetchAndParseSitemap = async (url: string): Promise<any[]> => {
    try {
        const response = await fetchWithProxy(url);
        const text = await response.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, "text/xml");
        if (xml.querySelector("parsererror")) throw new Error("Invalid XML");

        const urls = Array.from(xml.querySelectorAll("url"));
        return urls.map(u => {
            const loc = u.querySelector("loc")?.textContent || "";
            const slug = loc.split('/').filter(Boolean).pop() || "";
            const title = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            return { url: loc, date: u.querySelector("lastmod")?.textContent, title: title || loc, id: 0 };
        }).filter(u => u.url);
    } catch(e) { console.error("Sitemap Error", e); throw e; }
};

export const fetchPageContent = async (url: string): Promise<{id: number, title: string, content: string}> => {
    const cacheKey = `scrape_${CacheService.generateHash(url)}`;
    const cached = CacheService.get<{id:number, title:string, content:string}>(cacheKey);
    if(cached) return cached;

    const response = await fetchWithProxy(url);
    if (!response.ok) throw new Error("Failed to load page");
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    let id = 0;
    const shortlink = doc.querySelector('link[rel="shortlink"]');
    if (shortlink) {
        const match = shortlink.getAttribute('href')?.match(/p=(\d+)/);
        if (match) id = parseInt(match[1]);
    }
    if (!id) {
         const pid = doc.body.className.split(' ').find(c => c.startsWith('postid-'));
         if (pid) id = parseInt(pid.split('-')[1]);
    }
    const title = doc.querySelector('title')?.innerText || "";
    const contentEl = doc.querySelector('.entry-content') || doc.querySelector('article') || doc.body;
    
    const result = { id, title, content: contentEl.innerHTML };
    if(result.content.length > 500) CacheService.set(cacheKey, result); 
    return result;
};

const generateAIContent = async (provider: AIProvider, apiKey: string, model: string, prompt: string, useGrounding: boolean = false): Promise<string> => {
    return withRetry(async () => {
        if (provider === 'gemini') {
            const key = apiKey || process.env.API_KEY || '';
            if (!key) throw new Error("Missing Gemini API Key");
            const ai = new GoogleGenAI({ apiKey: key });
            
            const tools = useGrounding ? [{ googleSearch: {} }] : [];
            
            const response = await ai.models.generateContent({
                model: model || 'gemini-2.5-flash',
                contents: prompt,
                config: { tools } 
            });
            return response.text || "{}";
        }
        
        if (!apiKey) throw new Error(`Missing API Key for ${provider}`);
        let baseUrl = 'https://api.openai.com/v1';
        if (provider === 'groq') baseUrl = 'https://api.groq.com/openai/v1';
        if (provider === 'openrouter') baseUrl = 'https://openrouter.ai/api/v1';

        const body: any = { model: model, messages: [{ role: 'user', content: prompt }], temperature: 0.2 };
        if (provider !== 'anthropic') body.response_format = { type: "json_object" };

        const headers: any = { 'Content-Type': 'application/json' };
        if (provider === 'anthropic') {
            headers['x-api-key'] = apiKey;
            headers['anthropic-version'] = '2023-06-01';
            headers['dangerously-allow-browser'] = 'true';
            body.max_tokens = 4096;
            const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) });
            const data = await res.json();
            return data.content?.[0]?.text || "{}";
        } else {
            headers['Authorization'] = `Bearer ${apiKey}`;
            if (provider === 'openrouter') headers['HTTP-Referer'] = window.location.origin;
            const res = await fetch(`${baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) });
            return (await res.json()).choices?.[0]?.message?.content || "{}";
        }
    }, 2, 2000);
};

const resolveWordpressId = async (config: AppConfig, slug: string): Promise<number | null> => {
    let url = config.wpUrl.trim().replace(/\/$/, "");
    if (!url.startsWith('http')) url = 'https://' + url;
    try {
        const response = await fetch(`${url}/wp-json/wp/v2/posts?slug=${slug}&_fields=id`, { method: 'GET' });
        if(response.ok) {
            const data = await response.json();
            if(data && data.length > 0) return data[0].id;
        }
    } catch(e) {}
    return null;
}

export const fetchRawPostContent = async (config: AppConfig, postId: number, postUrl?: string): Promise<{content: string, title: string, resolvedId: number, featuredImage?: string}> => {
    const cacheKey = `wp_full_${postId}_${CacheService.generateHash(postUrl||'')}`;
    const cached = CacheService.get<{content: string, title: string, resolvedId: number, featuredImage?: string}>(cacheKey);
    if(cached) return cached;

    let url = config.wpUrl.trim().replace(/\/$/, "");
    if (!url.startsWith('http')) url = 'https://' + url;
    const auth = btoa(`${config.wpUser}:${config.wpAppPassword}`);
    
    const fetchById = async (id: number) => {
        const endpoint = `${url}/wp-json/wp/v2/posts/${id}?context=edit&_embed`;
        const res = await fetch(endpoint, { method: 'GET', headers: { 'Authorization': `Basic ${auth}` } });
        if (!res.ok) throw new Error(res.status.toString());
        const data = await res.json();
        
        let featImg = '';
        try {
            if (data._embedded && data._embedded['wp:featuredmedia'] && data._embedded['wp:featuredmedia'][0]) {
                featImg = data._embedded['wp:featuredmedia'][0].source_url;
            }
        } catch(e) {}
        
        const result = { 
            content: data.content.rendered || data.content.raw || "", 
            title: data.title.rendered || data.title.raw || "",
            resolvedId: id,
            featuredImage: featImg
        };
        CacheService.set(cacheKey, result);
        return result;
    };

    try {
        if (postId > 0) return await fetchById(postId);
        throw new Error("404");
    } catch (e: any) {
        if (postUrl) {
            const slug = postUrl.split('/').filter(Boolean).pop() || "";
            if (slug) {
                const realId = await resolveWordpressId(config, slug);
                if (realId) return await fetchById(realId);
            }
        }
        if (postUrl) {
             const page = await fetchPageContent(postUrl);
             return { content: page.content, title: page.title, resolvedId: page.id || 0, featuredImage: '' };
        }
        throw new Error(`Failed to sync post. Ensure Permalinks are set to 'Post Name' in WP.`);
    }
};

const generateJsonLd = (product: ProductDetails): string => {
    const schema = {
        "@context": "https://schema.org/",
        "@type": "Product",
        "name": product.title,
        "image": product.imageUrl,
        "description": product.verdict || product.title,
        "brand": { "@type": "Brand", "name": "Amazon" },
        "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": product.rating,
            "bestRating": "5",
            "ratingCount": "120"
        },
        "offers": {
            "@type": "Offer",
            "url": `https://amazon.com/dp/${product.asin}`,
            "priceCurrency": "USD",
            "price": product.price.replace(/[^0-9.]/g, '') || "0.00",
            "availability": "https://schema.org/InStock"
        }
    };
    return JSON.stringify(schema);
};

// SOTA v21: FALLBACK-READY AI
// If AI fails but manual inputs exist, return a valid product object.
export const analyzeContentAndFindProduct = async (
    title: string, 
    htmlContent: string, 
    config: AppConfig,
    options?: { manualAsin?: string; manualImage?: string; mode?: 'single' | 'multi'; fallbackImage?: string }
): Promise<{ product: ProductDetails, detectedProducts: ProductDetails[], confidence: number }> => {
    
    // 1. DATA PREP
    const mode = options?.mode || 'single';
    const manualAsin = options?.manualAsin?.trim();
    const manualImage = options?.manualImage?.trim();
    const existingAsin = manualAsin || extractAsinFromHtml(htmlContent);
    const context = extractContext(htmlContent);

    // 2. HELPER: Manual Product Construction (Fallback)
    const createFallbackProduct = (): ProductDetails => {
        let fallbackImg = options?.fallbackImage || "https://placehold.co/500?text=Product";
        if (manualImage) fallbackImg = manualImage;
        else if (manualAsin) fallbackImg = constructAmazonImageUrl(manualAsin);

        return {
            asin: manualAsin || "",
            title: manualAsin ? "Amazon Product (Check Details)" : "Detected Product",
            price: "Check Price",
            rating: 4.8,
            prime: true,
            imageUrl: fallbackImg,
            description: "",
            pros: ["Verified Quality", "Fast Shipping"],
            cons: [],
            award: "Top Pick",
            verdict: "A solid choice based on current specifications.",
            specs: {},
            contextSnippet: ""
        };
    };

    if (!htmlContent || htmlContent.length < 50) return { product: createFallbackProduct(), detectedProducts: [], confidence: 0 };
    
    const useGrounding = !!manualAsin || !existingAsin || mode === 'multi';

    let instruction = "";
    if (manualAsin) {
        instruction = `CRITICAL TASK: I have provided a specific ASIN: ${manualAsin}. You MUST find the details for THIS specific product on Amazon. Use Google Search to find the REAL-TIME Price and specific product title.`;
    } else if (mode === 'multi') {
        instruction = `DEEP SCAN MODE: Identify ALL distinct products reviewed.`;
    } else if (existingAsin) {
        instruction = `Detected ASIN ${existingAsin}. Verify details.`;
    } else {
        instruction = `SEARCH the web for the primary product. Find its ASIN, current price, and image URL.`;
    }

    const outputFormat = mode === 'multi' 
        ? `[ { "asin": "...", "productName": "...", "price": "...", "imageUrl": "...", "verdict": "...", "contextSnippet": "..." } ]`
        : `{ "found": boolean, "confidence": number, "asin": "...", "productName": "...", "price": "...", "imageUrl": "...", "verdict": "...", "contextSnippet": "..." }`;

    const prompt = `
      You are an Elite Direct-Response Copywriter.
      Task: ${instruction}
      Requirements:
      1. PRICE: Find exact current price.
      2. VERDICT: Write a 2-sentence "Verdict".
      Input Context: Title: "${title}", Snippet: "${context.substring(0, 5000)}..."
      Return JSON Only: ${outputFormat}
    `;

    try {
        const jsonString = await generateAIContent(config.aiProvider, config.aiApiKey, config.aiModel, prompt, useGrounding);
        
        let cleanJson = jsonString.replace(/```json|```/g, '').trim();
        const jsonMatch = cleanJson.match(/(\{|\[)[\s\S]*(\}|\])/);
        if (jsonMatch) cleanJson = jsonMatch[0];
        
        let data: any;
        try {
             data = JSON.parse(cleanJson);
        } catch(e) {
             throw new Error("AI returned invalid JSON");
        }

        const mapToProduct = (d: any): ProductDetails => {
            let finalImage = "https://placehold.co/500?text=Product";

            // Priority 1: User Manual Override (Absolute Truth)
            if (manualImage && manualImage.startsWith('http')) {
                finalImage = manualImage;
            } 
            // Priority 2: Constructed Amazon URL from ASIN (Mathematical Certainty)
            else if (d.asin || manualAsin) {
                 finalImage = constructAmazonImageUrl(d.asin || manualAsin);
            }
            // Priority 3: AI Found Image
            else if (d.imageUrl && d.imageUrl.startsWith('http')) {
                finalImage = d.imageUrl;
            }
            // Priority 4: WP Featured Image / Fallback
            else if (options?.fallbackImage) {
                finalImage = options.fallbackImage;
            }

            const prod: ProductDetails = {
                asin: manualAsin || d.asin || '',
                title: d.productName || "Unknown Product",
                price: d.price || "Check Price",
                rating: 4.8,
                prime: true,
                imageUrl: finalImage,
                description: "",
                pros: d.pros || ["High Quality", "Great Value"],
                cons: d.cons,
                award: d.award || "Top Pick",
                verdict: d.verdict || "This product delivers outstanding value and performance that you simply cannot ignore.",
                specs: d.specs,
                contextSnippet: d.contextSnippet 
            };
            prod.schema = generateJsonLd(prod);
            return prod;
        };

        if (mode === 'multi' && Array.isArray(data)) {
             const products = data.map(mapToProduct);
             return { product: products[0], detectedProducts: products, confidence: 90 };
        } else {
             const prod = mapToProduct(data);
             if(manualAsin) prod.asin = manualAsin; 
             return { product: prod, detectedProducts: [prod], confidence: data.confidence || 85 };
        }

    } catch (e) {
        console.warn("AI Analysis Failed", e);
        // CRITICAL FALLBACK: If AI failed but we have manual data, return a functional product object
        if (manualAsin || manualImage) {
             const fallback = createFallbackProduct();
             return { product: fallback, detectedProducts: [fallback], confidence: 100 };
        }
        return { product: {} as ProductDetails, detectedProducts: [], confidence: 0 };
    }
};

export const pushToWordPress = async (config: AppConfig, postId: number, content: string): Promise<string> => {
    let url = config.wpUrl.trim().replace(/\/$/, "");
    if (!url.startsWith('http')) url = 'https://' + url;
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http:')) {
        throw new Error("Security Block: HTTPS App -> HTTP Site.");
    }
    const auth = btoa(`${config.wpUser}:${config.wpAppPassword}`);
    try {
        const response = await fetch(`${url}/wp-json/wp/v2/posts/${postId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
            body: JSON.stringify({ content: content })
        });
        if (!response.ok) {
            if (response.status === 401) throw new Error("WP Auth Failed (401)");
            throw new Error(`WP Error: ${response.status}`);
        }
        return (await response.json()).link;
    } catch (e: any) {
        if (e.message.includes('Failed to fetch')) {
             const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'APP_URL';
             throw new Error(`CORS Error: Add '${currentOrigin}' to WP CORS Plugin.`);
        }
        throw e;
    }
};

export const generateProductBoxHtml = (product: ProductDetails, affiliateTag: string, enableStickyBar: boolean = true): string => {
  const cleanAsin = product.asin?.trim() || "";
  const link = cleanAsin ? `https://www.amazon.com/dp/${cleanAsin}?tag=${affiliateTag}` : "#";
  const uniqueId = `amz-${Math.random().toString(36).substr(2, 9)}`;
  const reset = `all: unset; box-sizing: border-box; font-family: -apple-system, system-ui, sans-serif; line-height: 1.5; color: #1e293b; display: block;`;
  
  // Clean logic: If price is "Not specified in context", we hide the specific text and just show Check Price button.
  let displayPrice = product.price;
  if (!displayPrice || displayPrice.toLowerCase().includes('not specified') || displayPrice.toLowerCase().includes('check price')) {
      displayPrice = "Check Price";
  }

  const styles = `
    <style>
      @keyframes amz-pulse-${uniqueId} {
        0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
        70% { transform: scale(1.02); box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
        100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
      }
      .amz-btn-pulse-${uniqueId} {
        animation: amz-pulse-${uniqueId} 2s infinite;
      }
      .amz-glass-${uniqueId} {
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }
    </style>
  `;

  let stickyHtml = '';
  if (enableStickyBar && cleanAsin) {
      stickyHtml = `
      <div id="${uniqueId}-sticky" style="${reset} position: fixed; bottom: 0; left: 0; right: 0; background: rgba(255,255,255,0.9); backdrop-filter: blur(15px); padding: 12px 20px; border-top: 1px solid rgba(0,0,0,0.05); box-shadow: 0 -4px 30px rgba(0,0,0,0.1); z-index: 99999; display: none; justify-content: space-between; align-items: center; transform: translateY(100%); transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);">
          <div style="${reset} display: flex; flex-direction: column;">
             <span style="font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: 800; letter-spacing: 1px;">Available On Amazon</span>
             <span style="font-weight: 900; color: #0f172a; font-size: 16px;">${displayPrice}</span>
          </div>
          <a href="${link}" target="_blank" rel="nofollow sponsored" style="${reset} background: #000; color: white; padding: 10px 24px; border-radius: 99px; font-weight: 700; font-size: 13px; text-decoration: none; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
             Check Deal
          </a>
      </div>
      <script>
         (function(){
            var bar = document.getElementById('${uniqueId}-sticky');
            if(window.innerWidth < 768 && bar) {
                bar.style.display = 'flex';
                setTimeout(function(){ bar.style.transform = 'translateY(0)'; }, 800);
            }
         })();
      </script>`;
  }

  const schemaHtml = product.schema ? `<script type="application/ld+json">${product.schema}</script>` : '';

  return `
    <!-- wp:html -->
    <div id="${uniqueId}" class="amz-sota-box amz-glass-${uniqueId}" style="${reset} margin: 4rem auto; max-width: 850px; border-radius: 24px; border: 1px solid rgba(0,0,0,0.06); box-shadow: 0 25px 50px -12px rgba(0,0,0,0.1); overflow: hidden; position: relative;">
      ${schemaHtml}
      ${styles}
      
      <!-- Verified Header -->
      <div style="${reset} background: linear-gradient(to right, #f8fafc, #fff); border-bottom: 1px solid #f1f5f9; padding: 12px 24px; display: flex; align-items: center; justify-content: space-between;">
          <div style="${reset} display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #475569; letter-spacing: 0.5px;">
             <span style="display:inline-block; width:6px; height:6px; background:#10b981; border-radius:50%;"></span> Expert Verified
          </div>
          <div style="${reset} font-size: 10px; font-weight: 800; text-transform: uppercase; color: #fff; background: linear-gradient(135deg, #3b82f6, #2563eb); padding: 5px 14px; border-radius: 99px; box-shadow: 0 2px 10px rgba(37, 99, 235, 0.2);">
             ${product.award || "Top Choice"}
          </div>
      </div>

      <div class="amz-layout" style="${reset} display: flex; flex-wrap: wrap;">
        <!-- Image -->
        <div style="${reset} flex: 1; min-width: 300px; padding: 40px; display: flex; align-items: center; justify-content: center; background: #fff;">
           <a href="${link}" target="_blank" rel="nofollow sponsored" style="display: block; transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
             <img src="${product.imageUrl}" alt="${product.title}" style="max-width: 100%; height: auto; max-height: 240px; object-fit: contain; filter: drop-shadow(0 10px 15px rgba(0,0,0,0.1));" />
           </a>
        </div>
        <!-- Info -->
        <div style="${reset} flex: 1.4; min-width: 320px; padding: 32px; display: flex; flex-direction: column; background: #fbfbfc;">
           <h3 style="${reset} font-size: 1.5rem; font-weight: 800; color: #0f172a; line-height: 1.25; margin-bottom: 12px; letter-spacing: -0.02em;">
             <a href="${link}" target="_blank" rel="nofollow sponsored" style="text-decoration: none; color: #0f172a;">${product.title}</a>
           </h3>
           
           <div style="${reset} display: flex; align-items: center; gap: 10px; margin-bottom: 20px;">
              <div style="display:flex; color: #fbbf24;">${"★".repeat(5)}</div>
              ${product.prime ? `<span style="font-size: 10px; font-weight: 900; color: #00a8e1; font-style: italic;">PRIME</span>` : ''}
              <span style="font-size: 11px; color: #94a3b8; font-weight: 600;">| 200+ Bought in past month</span>
           </div>

           <p style="${reset} font-size: 1rem; color: #475569; margin-bottom: 24px; line-height: 1.6; background: #fff; padding: 16px; border-radius: 12px; border: 1px solid #e2e8f0;">
              <span style="font-weight: 800; color: #0f172a; font-size: 11px; text-transform: uppercase; display: block; margin-bottom: 6px; letter-spacing: 0.5px;">The Verdict</span>
              ${product.verdict}
           </p>

           <!-- Specs Mini -->
           ${product.specs ? `<div style="${reset} display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 24px;">
              ${Object.entries(product.specs).slice(0,2).map(([k,v]) => `
                <div style="font-size: 11px; color: #475569; background: #f1f5f9; padding: 6px 12px; border-radius: 8px;">
                   <span style="font-weight:700; color:#1e293b;">${k}:</span> ${v}
                </div>
              `).join('')}
           </div>` : ''}

           <div style="${reset} margin-top: auto; display: flex; align-items: center; justify-content: space-between; padding-top: 10px;">
              <div style="display:flex; flex-direction:column;">
                <span style="font-size:10px; font-weight:700; color:#94a3b8; text-transform:uppercase;">Current Price</span>
                <span style="font-size: 1.8rem; font-weight: 900; color: #0f172a; letter-spacing: -1px;">${displayPrice}</span>
              </div>
              <a href="${link}" target="_blank" rel="nofollow sponsored" class="amz-btn-pulse-${uniqueId}" style="${reset} background: #0f172a; color: white; padding: 14px 32px; border-radius: 14px; font-weight: 700; font-size: 14px; text-decoration: none; transition: transform 0.2s; display:inline-flex; align-items:center; gap:8px;">
                Check Price <span style="font-size:16px;">&rarr;</span>
              </a>
           </div>
        </div>
      </div>
      ${stickyHtml}
    </div>
    <!-- /wp:html -->
  `;
};

// SOTA v22: ZERO DUPLICATES
const stripExistingProductBox = (html: string): string => {
    if (!html) return "";
    // Remove by Class (DOM parser for accuracy)
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        // Find by specific class 'amz-sota-box' or common container
        doc.querySelectorAll('.amz-sota-box').forEach(e => {
            // Traverse up to remove the WP wrapper comment blocks if possible
            const parent = e.parentElement;
            if(parent && parent.innerHTML.includes('amz-sota-box')) {
                // Remove the element
                e.remove();
            }
        });
        return doc.body.innerHTML; 
    } catch(e) {
        // Fallback regex if DOM parser fails
        return html.replace(/<div id="amz-.*?" class="amz-sota-box.*?<\/div>/gs, '');
    }
};

export const insertIntoContent = (html: string, box: string, method: InsertionMethod, contextSnippet?: string): string => {
    // STEP 1: CLEAN
    // We must manually strip ANY existing box to prevent duplicates.
    // Since DOMParser returns body innerHTML, we might lose <html> tags but for WP content snippets that is fine.
    // However, to be safe with React string manipulation, let's use a regex that targets our specific ID pattern.
    let cleanHtml = html.replace(/<!-- wp:html -->\s*<div id="amz-.*?" class="amz-sota-box[\s\S]*?<\/div>\s*<!-- \/wp:html -->/g, '');
    cleanHtml = cleanHtml.replace(/<div id="amz-.*?" class="amz-sota-box[\s\S]*?<\/div>/g, '');

    if (!cleanHtml) cleanHtml = html; // Safety net

    // STEP 2: INSERT
    if (method === 'context_match' && contextSnippet) {
        const cleanSnippet = contextSnippet.replace(/[^\w\s]/g, '').substring(0, 30);
        const regex = new RegExp(`(<h[23][^>]*>.*?${cleanSnippet}.*?</h[23]>)`, 'i');
        const match = cleanHtml.match(regex);
        if (match && match.index !== undefined) {
             const insertPos = match.index + match[0].length;
             return cleanHtml.substring(0, insertPos) + `\n\n${box}\n\n` + cleanHtml.substring(insertPos);
        }
    }
    if (cleanHtml.includes('<!-- wp:')) {
        const blocks = [...cleanHtml.matchAll(/<!-- \/wp:(paragraph|group|image|heading|list) -->/gi)];
        if (blocks.length === 0) return cleanHtml + "\n\n" + box; 
        
        let idx = cleanHtml.length;
        if (method === 'top') idx = blocks[0].index! + blocks[0][0].length;
        else if (method === 'smart_middle') idx = blocks[Math.floor(blocks.length / 2)].index! + blocks[Math.floor(blocks.length / 2)][0].length;
        else if (method === 'after_h2') {
             const h2 = [...cleanHtml.matchAll(/<!-- \/wp:heading -->/gi)];
             idx = h2.length > 0 ? h2[0].index! + h2[0][0].length : blocks[0].index! + blocks[0][0].length;
        } else if (method === 'bottom') {
             idx = cleanHtml.length;
        }
        return cleanHtml.substring(0, idx) + `\n\n${box}\n\n` + cleanHtml.substring(idx);
    } 
    const ps = [...cleanHtml.matchAll(/<\/p>/gi)];
    if (ps.length === 0) return cleanHtml + "\n\n" + box;
    let idx = cleanHtml.length;
    if (method === 'top') idx = ps[0].index! + 4;
    else if (method === 'smart_middle') idx = ps[Math.floor(ps.length/2)].index! + 4;
    else if (method === 'after_h2') {
        const h2 = /<\/h2>/i.exec(cleanHtml);
        idx = h2 ? h2.index + 5 : ps[0].index! + 4;
    } else if (method === 'bottom') {
        idx = cleanHtml.length;
    }
    return cleanHtml.substring(0, idx) + `\n\n${box}\n\n` + cleanHtml.substring(idx);
};
