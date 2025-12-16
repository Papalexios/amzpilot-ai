
import React, { useState } from 'react';
import { AppConfig, BlogPost, AppStep, SitemapState } from './types';
import { ConfigPanel } from './components/ConfigPanel';
import { SitemapScanner } from './components/SitemapScanner';
import { PostEditor } from './components/PostEditor';
import { LandingPage } from './components/LandingPage';

const App: React.FC = () => {
  const [hasEntered, setHasEntered] = useState(false);
  const [config, setConfig] = useState<AppConfig>({
    amazonTag: '',
    amazonAccessKey: '',
    amazonSecretKey: '',
    amazonRegion: 'us-east-1',
    wpUrl: '',
    wpUser: '',
    wpAppPassword: '',
    autoPublishThreshold: 85,
    concurrencyLimit: 3,
    enableSchema: true,
    enableStickyBar: true,
    aiProvider: 'gemini',
    aiApiKey: '',
    aiModel: 'gemini-2.5-flash'
  });

  const [currentStep, setCurrentStep] = useState<AppStep>(AppStep.SITEMAP);
  const [selectedPost, setSelectedPost] = useState<BlogPost | null>(null);
  const [sitemapData, setSitemapData] = useState<SitemapState>({ url: '', posts: [] });

  if (!hasEntered) {
    return <LandingPage onEnter={() => setHasEntered(true)} />;
  }

  return (
    // SOTA v18: Use h-dvh for mobile browsers to handle address bars correctly
    <div className="h-dvh w-screen bg-dark-950 text-slate-200 font-sans selection:bg-brand-500 selection:text-white overflow-hidden flex flex-col animate-fade-in">
      
      {/* Config Modal */}
      <ConfigPanel initialConfig={config} onSave={setConfig} />

      {/* Main Viewport */}
      <main className="flex-1 w-full h-full relative overflow-hidden">
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
            allPosts={sitemapData.posts}
            onSwitchPost={setSelectedPost}
          />
        )}
      </main>
    </div>
  );
};

export default App;
