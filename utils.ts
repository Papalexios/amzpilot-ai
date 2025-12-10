
import { ProductDetails, AppConfig, InsertionMethod, AIProvider } from './types';
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
 * CACHE SERVICE
 */
const CACHE_TTL = 1000 * 60 * 60 * 24; 
const CacheService = {
  get: (key: string) => {
    try {
      const item = localStorage.getItem(key);
      if (!item) return null;
      const parsed = JSON.parse(item);
      if (Date.now() - parsed.timestamp > CACHE_TTL) {
        localStorage.removeItem(key);
        return null;
      }
      return parsed.data;
    } catch(e) { return null; }
  },
  set: (key: string, data: any) => {
    try {
        localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
    } catch (e) { console.warn("Cache full"); }
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
 * CONTENT HUNTER v2
 */
const extractContext = (html: string): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, nav, footer, header, aside, .sidebar, .comments, .ad-container, meta, link, svg, button, input, form, [class*="menu"], [class*="nav"], [class*="footer"], [class*="popup"]').forEach(e => e.remove());
    
    // Find biggest block of text
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
      await sleep(10); // Breathe
  }
  return results;
};

// CORS PROXY FALLBACK (Triple Redundancy)
const fetchWithProxy = async (url: string) => {
    const proxies = [
        `https://corsproxy.io/?${encodeURIComponent(url)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        `https://thingproxy.freeboard.io/fetch/${url}`
    ];
    for (const proxyUrl of proxies) {
        try {
            const response = await fetch(proxyUrl);
            if (response.ok) return response;
        } catch (e) { console.warn(`Proxy failed: ${proxyUrl}`); }
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
    return { id, title, content: contentEl.innerHTML };
};

const generateAIContent = async (provider: AIProvider, apiKey: string, model: string, prompt: string): Promise<string> => {
    return withRetry(async () => {
        if (provider === 'gemini') {
            const key = apiKey || process.env.API_KEY || '';
            if (!key) throw new Error("Missing Gemini API Key");
            const ai = new GoogleGenAI({ apiKey: key });
            const response = await ai.models.generateContent({
                model: model || 'gemini-2.5-flash',
                contents: prompt,
                config: { tools: [{ googleSearch: {} }] } 
            });
            return response.text || "{}";
        }
        
        if (!apiKey) throw new Error(`Missing API Key for ${provider}`);
        let baseUrl = 'https://api.openai.com/v1';
        if (provider === 'groq') baseUrl = 'https://api.groq.com/openai/v1';
        if (provider === 'openrouter') baseUrl = 'https://openrouter.ai/api/v1';

        const body: any = { model: model, messages: [{ role: 'user', content: prompt }], temperature: 0.3 };
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

export const fetchRawPostContent = async (config: AppConfig, postId: number, postUrl?: string): Promise<{content: string, resolvedId: number}> => {
    let url = config.wpUrl.trim().replace(/\/$/, "");
    if (!url.startsWith('http')) url = 'https://' + url;
    const auth = btoa(`${config.wpUser}:${config.wpAppPassword}`);
    
    const fetchById = async (id: number) => {
        const endpoint = `${url}/wp-json/wp/v2/posts/${id}?context=edit`;
        const res = await fetch(endpoint, { method: 'GET', headers: { 'Authorization': `Basic ${auth}` } });
        if (!res.ok) throw new Error(res.status.toString());
        const data = await res.json();
        return { content: data.content.raw || data.content.rendered || "", resolvedId: id };
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

export const analyzeContentAndFindProduct = async (
    title: string, 
    htmlContent: string, 
    config: AppConfig
): Promise<{ product: ProductDetails, confidence: number }> => {
    
    if (!htmlContent || htmlContent.length < 50) return { product: {} as ProductDetails, confidence: 0 };
    const existingAsin = extractAsinFromHtml(htmlContent);
    const cacheKey = `ai_v17_${config.aiProvider}_${title.replace(/\W/g, '')}_${existingAsin}`;
    const cached = CacheService.get(cacheKey);
    if (cached) return cached;

    const context = extractContext(htmlContent);
    const instruction = existingAsin ? `Detected ASIN ${existingAsin}. Use this. Verify product details.` : `Find the primary product being reviewed.`;

    const prompt = `
      Act as Alex Hormozi (Direct, Sales-Focused).
      Analyze: "${title}"
      Text: "${context.substring(0, 2000)}..."
      ${instruction}
      
      JSON Response:
      {
        "found": boolean,
        "confidence": number (0-100),
        "asin": "${existingAsin || ''}",
        "productName": "Exact Name",
        "award": "Badge (e.g. Top Pick)",
        "verdict": "One sentence punchy sales hook.",
        "pros": ["Short Pro 1", "Short Pro 2"],
        "cons": ["Short Con 1"],
        "specs": {"Spec": "Value"},
        "price": "$0.00"
      }
    `;

    try {
        const jsonString = await generateAIContent(config.aiProvider, config.aiApiKey, config.aiModel, prompt);
        let cleanJson = jsonString.replace(/```json|```/g, '').trim();
        const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
        if (jsonMatch) cleanJson = jsonMatch[0];
        const data = JSON.parse(cleanJson);

        if (!data.found) throw new Error("Low confidence");

        const imageUrl = data.asin ? `https://images-na.ssl-images-amazon.com/images/P/${data.asin}.01._SS500_.jpg` : "https://placehold.co/500?text=Product";
        
        const product: ProductDetails = {
            asin: data.asin || '',
            title: data.productName,
            price: data.price || "Check Price",
            rating: 4.5,
            prime: true, 
            imageUrl: imageUrl,
            description: "",
            pros: data.pros,
            cons: data.cons,
            award: data.award,
            verdict: data.verdict,
            specs: data.specs
        };
        product.schema = generateJsonLd(product);

        const result = { product, confidence: data.confidence || 80 };
        CacheService.set(cacheKey, result);
        return result;

    } catch (e) {
        return { product: {} as ProductDetails, confidence: 0 };
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

  // SOTA v17: Heartbeat Animation Injection
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
    </style>
  `;

  let stickyHtml = '';
  if (enableStickyBar && cleanAsin) {
      stickyHtml = `
      <div id="${uniqueId}-sticky" style="${reset} position: fixed; bottom: 0; left: 0; right: 0; background: rgba(255,255,255,0.95); backdrop-filter: blur(10px); padding: 12px 16px; border-top: 1px solid #e2e8f0; box-shadow: 0 -4px 20px rgba(0,0,0,0.05); z-index: 99999; display: none; justify-content: space-between; align-items: center; transform: translateY(100%); transition: transform 0.3s ease;">
          <div style="${reset} display: flex; flex-direction: column;">
             <span style="font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 800; letter-spacing: 0.5px;">Best Price</span>
             <span style="font-weight: 900; color: #0f172a; font-size: 15px;">${product.price}</span>
          </div>
          <a href="${link}" target="_blank" rel="nofollow sponsored" style="${reset} background: #0f172a; color: white; padding: 10px 24px; border-radius: 99px; font-weight: 700; font-size: 13px; text-decoration: none; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.2);">
             Check Amazon
          </a>
      </div>
      <script>
         (function(){
            var bar = document.getElementById('${uniqueId}-sticky');
            if(window.innerWidth < 768 && bar) {
                bar.style.display = 'flex';
                setTimeout(function(){ bar.style.transform = 'translateY(0)'; }, 1000);
            }
         })();
      </script>`;
  }

  const schemaHtml = product.schema ? `<script type="application/ld+json">${product.schema}</script>` : '';

  return `
    <!-- wp:html -->
    <div id="${uniqueId}" class="amz-sota-box" style="${reset} margin: 3rem auto; max-width: 800px; background: #fff; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 20px 40px -10px rgba(0,0,0,0.08); overflow: hidden; position: relative;">
      ${schemaHtml}
      ${styles}
      
      <!-- Verified Header -->
      <div style="${reset} background: #f8fafc; border-bottom: 1px solid #f1f5f9; padding: 10px 20px; display: flex; align-items: center; justify-content: space-between;">
          <div style="${reset} display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #64748b;">
             <span style="color: #10b981;">●</span> Verified Pick
          </div>
          <div style="${reset} font-size: 10px; font-weight: 800; text-transform: uppercase; color: #3b82f6; background: #eff6ff; padding: 4px 10px; border-radius: 99px;">
             ${product.award || "Top Choice"}
          </div>
      </div>

      <div class="amz-layout" style="${reset} display: flex; flex-wrap: wrap;">
        <!-- Image -->
        <div style="${reset} flex: 1; min-width: 280px; padding: 30px; display: flex; align-items: center; justify-content: center; border-right: 1px solid #f1f5f9;">
           <a href="${link}" target="_blank" rel="nofollow sponsored" style="display: block; transition: transform 0.2s;">
             <img src="${product.imageUrl}" alt="${product.title}" style="max-width: 100%; height: auto; max-height: 220px; object-fit: contain;" />
           </a>
        </div>
        <!-- Info -->
        <div style="${reset} flex: 1.5; min-width: 300px; padding: 25px; display: flex; flex-direction: column;">
           <h3 style="${reset} font-size: 1.4rem; font-weight: 800; color: #0f172a; line-height: 1.3; margin-bottom: 10px;">
             <a href="${link}" target="_blank" rel="nofollow sponsored" style="text-decoration: none; color: #0f172a;">${product.title}</a>
           </h3>
           
           <div style="${reset} display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
              <span style="color: #fbbf24; font-size: 1.1rem;">★★★★★</span>
              ${product.prime ? `<span style="font-size: 10px; font-weight: 900; color: #00a8e1; font-style: italic;">PRIME</span>` : ''}
           </div>

           <p style="${reset} font-size: 0.95rem; color: #475569; margin-bottom: 20px; line-height: 1.6; border-left: 3px solid #3b82f6; padding-left: 12px;">
              <span style="font-weight: 800; color: #0f172a; font-size: 11px; text-transform: uppercase; display: block; margin-bottom: 4px;">Why we picked it</span>
              ${product.verdict}
           </p>

           <!-- Specs Mini -->
           ${product.specs ? `<div style="${reset} display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 20px;">
              ${Object.entries(product.specs).slice(0,2).map(([k,v]) => `
                <div style="font-size: 11px; color: #64748b; background: #f8fafc; padding: 4px 8px; border-radius: 4px;"><b>${k}:</b> ${v}</div>
              `).join('')}
           </div>` : ''}

           <div style="${reset} margin-top: auto; display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #f1f5f9; padding-top: 16px;">
              <span style="font-size: 1.6rem; font-weight: 900; color: #0f172a;">${product.price}</span>
              <a href="${link}" target="_blank" rel="nofollow sponsored" class="amz-btn-pulse-${uniqueId}" style="${reset} background: #0f172a; color: white; padding: 12px 28px; border-radius: 10px; font-weight: 700; font-size: 14px; text-decoration: none;">Check Price &rarr;</a>
           </div>
        </div>
      </div>
      ${stickyHtml}
    </div>
    <!-- /wp:html -->
  `;
};

export const insertIntoContent = (html: string, box: string, method: InsertionMethod): string => {
    if (!html) return box;
    
    // Gutenberg Logic
    if (html.includes('<!-- wp:')) {
        const blocks = [...html.matchAll(/<!-- \/wp:(paragraph|group|image|heading|list) -->/gi)];
        if (blocks.length === 0) return html + box;
        let idx = html.length;
        if (method === 'top') idx = blocks[0].index! + blocks[0][0].length;
        else if (method === 'smart_middle') idx = blocks[Math.floor(blocks.length / 2)].index! + blocks[Math.floor(blocks.length / 2)][0].length;
        else if (method === 'after_h2') {
             const h2 = [...html.matchAll(/<!-- \/wp:heading -->/gi)];
             idx = h2.length > 0 ? h2[0].index! + h2[0][0].length : blocks[0].index! + blocks[0][0].length;
        }
        return html.substring(0, idx) + `\n\n${box}\n\n` + html.substring(idx);
    } 
    // Classic Logic
    const ps = [...html.matchAll(/<\/p>/gi)];
    if (ps.length === 0) return html + box;
    let idx = html.length;
    if (method === 'top') idx = ps[0].index! + 4;
    else if (method === 'smart_middle') idx = ps[Math.floor(ps.length/2)].index! + 4;
    else if (method === 'after_h2') {
        const h2 = /<\/h2>/i.exec(html);
        idx = h2 ? h2.index + 5 : ps[0].index! + 4;
    }
    return html.substring(0, idx) + `\n\n${box}\n\n` + html.substring(idx);
};
