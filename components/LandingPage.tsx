
import React from 'react';

interface LandingPageProps {
  onEnter: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onEnter }) => {
  return (
    <div className="min-h-screen bg-dark-950 text-white flex flex-col font-sans relative overflow-hidden">
      
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-brand-600/20 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Header / Nav */}
      <nav className="relative z-10 w-full max-w-7xl mx-auto px-6 py-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          {/* Artistic SOTA Logo */}
          <div className="w-10 h-10 bg-gradient-to-br from-brand-400 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-brand-500/20 rotate-3 hover:rotate-6 transition-transform">
             <i className="fa-solid fa-bolt text-white text-xl"></i>
          </div>
          <span className="text-2xl font-black tracking-tighter">Amz<span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-purple-400">Pilot</span></span>
        </div>
        
        <a 
          href="https://affiliatemarketingforsuccess.com" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-xs font-bold uppercase tracking-widest text-gray-400 hover:text-white transition-colors border-b border-transparent hover:border-brand-500 pb-1"
        >
          From the creators of <span className="text-brand-400">AffiliateMarketingForSuccess.com</span>
        </a>
      </nav>

      {/* Main Hero Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-4 py-20">
        <div className="max-w-4xl mx-auto space-y-8 animate-fade-in-up">
          
          <h1 className="text-5xl md:text-7xl font-black leading-tight tracking-tight">
            The Future of <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 via-purple-400 to-pink-400">Autonomous Monetization</span>
          </h1>
          
          <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Scan your WordPress content. Identify missed opportunities. Deploy high-conversion SOTA product boxes instantly with AI.
          </p>

          <div className="flex flex-col md:flex-row items-center justify-center gap-6 pt-8">
            <button 
              onClick={onEnter}
              className="group relative px-8 py-4 bg-white text-dark-950 font-black text-lg rounded-full shadow-2xl shadow-white/20 hover:shadow-white/40 hover:scale-105 transition-all duration-300"
            >
              <span className="relative z-10 flex items-center gap-2">
                Launch App <i className="fa-solid fa-arrow-right group-hover:translate-x-1 transition-transform"></i>
              </span>
            </button>

            <a 
              href="https://seo-hub.affiliatemarketingforsuccess.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-4 rounded-full border border-dark-700 hover:border-brand-500/50 hover:bg-dark-900/50 text-gray-300 hover:text-white font-bold transition-all duration-300 flex items-center gap-2"
            >
              <i className="fa-solid fa-gem text-brand-500"></i> Dominate Your Niche
            </a>
          </div>

        </div>
      </main>

      {/* SOTA Footer */}
      <footer className="relative z-10 bg-dark-900/80 backdrop-blur-xl border-t border-dark-800 mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            
            {/* Brand Column */}
            <div className="flex flex-col items-center md:items-start text-center md:text-left">
               <img 
                 src="https://affiliatemarketingforsuccess.com/wp-content/uploads/2023/03/cropped-Affiliate-Marketing-for-Success-Logo-Edited.png?lm=6666FEE0" 
                 alt="Affiliate Marketing For Success" 
                 className="h-12 w-auto mb-4 opacity-90 hover:opacity-100 transition-opacity"
               />
               <p className="text-xs text-gray-500 font-medium">
                 Created by <span className="text-white">Alexios Papaioannou</span>,<br/> Owner of AffiliateMarketingForSuccess.com
               </p>
            </div>

            {/* Links Column */}
            <div className="flex flex-wrap justify-center gap-6 md:gap-12">
               {[
                 { name: "Affiliate Marketing", url: "https://affiliatemarketingforsuccess.com/affiliate-marketing" },
                 { name: "AI", url: "https://affiliatemarketingforsuccess.com/ai" },
                 { name: "SEO", url: "https://affiliatemarketingforsuccess.com/seo" },
                 { name: "Blogging", url: "https://affiliatemarketingforsuccess.com/blogging" },
                 { name: "Reviews", url: "https://affiliatemarketingforsuccess.com/review" }
               ].map((link) => (
                 <a 
                   key={link.name} 
                   href={link.url}
                   target="_blank"
                   rel="noopener noreferrer" 
                   className="text-sm font-bold text-gray-400 hover:text-brand-400 transition-colors uppercase tracking-wide"
                 >
                   {link.name}
                 </a>
               ))}
            </div>

            {/* Social / Extra */}
            <div className="flex gap-4">
              <a href="#" className="w-10 h-10 rounded-full bg-dark-800 flex items-center justify-center text-gray-400 hover:bg-brand-600 hover:text-white transition-all"><i className="fa-brands fa-twitter"></i></a>
              <a href="#" className="w-10 h-10 rounded-full bg-dark-800 flex items-center justify-center text-gray-400 hover:bg-brand-600 hover:text-white transition-all"><i className="fa-brands fa-linkedin"></i></a>
            </div>
          </div>
          
          <div className="mt-12 pt-8 border-t border-dark-800 text-center text-xs text-gray-600">
            &copy; {new Date().getFullYear()} AmzPilot AI. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};
