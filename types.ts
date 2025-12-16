
export type AIProvider = 'gemini' | 'openai' | 'anthropic' | 'groq' | 'openrouter';

export interface AppConfig {
  amazonTag: string;
  amazonAccessKey: string;
  amazonSecretKey: string;
  amazonRegion: string;
  wpUrl: string;
  wpUser: string;
  wpAppPassword: string;
  
  // SOTA Configuration
  autoPublishThreshold: number; 
  concurrencyLimit: number; 
  enableSchema: boolean; 
  enableStickyBar: boolean;
  
  // AI Brain Configuration
  aiProvider: AIProvider;
  aiApiKey: string;
  aiModel: string;
}

export interface ProductDetails {
  asin: string;
  title: string;
  price: string;
  imageUrl: string;
  rating: number;
  prime: boolean;
  description?: string;
  pros?: string[];
  cons?: string[];
  award?: string;
  verdict?: string;
  specs?: Record<string, string>;
  lastUpdated?: number; 
  url?: string;
  schema?: string; // JSON-LD
  contextSnippet?: string; // The H2/H3 header text to insert after (for listicles)
}

export type PostPriority = 'critical' | 'high' | 'medium' | 'low';
export type PostType = 'review' | 'listicle' | 'info' | 'unknown';

export interface BlogPost {
  id: number;
  title: string;
  url: string;
  status: 'draft' | 'publish';
  content: string; 
  date?: string;
  
  // Intelligence Fields
  priority?: PostPriority;
  postType?: PostType;
  monetizationStatus?: 'analyzing' | 'monetized' | 'opportunity' | 'error' | 'queued';
  
  autoPilotStatus?: 'idle' | 'analyzing' | 'found' | 'publishing' | 'published' | 'failed';
  proposedProduct?: ProductDetails;
  detectedProducts?: ProductDetails[]; // For multi-product posts
  aiConfidence?: number;
  processingLog?: string[]; 
}

export interface SitemapState {
  url: string;
  posts: BlogPost[];
  lastScanned?: number;
}

export type InsertionMethod = 'top' | 'bottom' | 'smart_middle' | 'after_h2' | 'context_match';

export enum AppStep {
  CONFIG = 'CONFIG',
  SITEMAP = 'SITEMAP',
  EDITOR = 'EDITOR',
}
