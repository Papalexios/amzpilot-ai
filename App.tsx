import React, { useState } from 'react';
import { AppConfig, BlogPost, AppStep, SitemapState } from './types';
import { ConfigPanel } from './components/ConfigPanel';
import { SitemapScanner } from './components/SitemapScanner';
import { PostEditor } from './components/PostEditor';

const App: React.FC = () => {
  const [config, setConfig] = useState<AppConfig>({
    amazonTag: '',
    // Initialize missing Amazon properties required by AppConfig
    amazonAccessKey: '',
    amazonSecretKey: '',
    amazonRegion: 'us-east-1',
    wpUrl: '',
    wpUser: '',
    wpAppPassword: '',
    autoPublishThreshold: 85,
    concurrencyLimit: 3,
    aiProvider: 'gemini',
    aiApiKey: '',
    aiModel: 'gemini-2.5-flash'
  });

  const [currentStep, setCurrentStep] = useState<AppStep>(AppStep.SITEMAP);
  const [selectedPost, setSelectedPost] = useState<BlogPost | null>(null);
  const [sitemapData, setSitemapData] = useState<SitemapState>({ url: '', posts: [] });

  return (
    <div className="min-h-screen bg-dark-950 text-slate-200 font-sans selection:bg-brand-500 selection:text-white overflow-hidden">
      
      {/* Config is always accessible via Modal */}
      <ConfigPanel initialConfig={config} onSave={setConfig} />

      <main className="w-full h-full overflow-auto">
        {currentStep === AppStep.SITEMAP && (
           <SitemapScanner 
              onPostSelect={(post) => { setSelectedPost(post); setCurrentStep(AppStep.EDITOR); }} 
              savedState={sitemapData}
              onStateChange={setSitemapData}
              config={config}
           />
        )}

        {currentStep === AppStep.EDITOR && selectedPost && (
          <PostEditor 
            post={selectedPost} 
            config={config} 
            onBack={() => { setSelectedPost(null); setCurrentStep(AppStep.SITEMAP); }} 
          />
        )}
      </main>
    </div>
  );
};

export default App;