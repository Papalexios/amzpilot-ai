import React, { useState } from 'react';
import { AppConfig, AIProvider } from '../types';
import { testConnection, SecureStorage } from '../utils';
import Toastify from 'toastify-js';

interface ConfigPanelProps {
  onSave: (config: AppConfig) => void;
  initialConfig: AppConfig;
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({ onSave, initialConfig }) => {
  const [config, setConfig] = useState<AppConfig>({
      ...initialConfig,
      autoPublishThreshold: initialConfig.autoPublishThreshold || 85,
      concurrencyLimit: initialConfig.concurrencyLimit || 3,
      aiProvider: initialConfig.aiProvider || 'gemini',
      aiModel: initialConfig.aiModel || 'gemini-2.5-flash',
      aiApiKey: initialConfig.aiApiKey || '',
      amazonAccessKey: SecureStorage.decrypt(initialConfig.amazonAccessKey || ''),
      amazonSecretKey: SecureStorage.decrypt(initialConfig.amazonSecretKey || ''),
      amazonRegion: initialConfig.amazonRegion || 'us-east-1'
  });
  
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'wp' | 'amazon' | 'ai'>('wp');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
        ...config,
        amazonAccessKey: SecureStorage.encrypt(config.amazonAccessKey),
        amazonSecretKey: SecureStorage.encrypt(config.amazonSecretKey)
    });
    setIsOpen(false);
  };

  const handleTestConnection = async () => {
      setTestStatus('testing');
      const result = await testConnection(config);
      if (result.success) {
          setTestStatus('success');
          Toastify({ text: "Connected to WordPress!", backgroundColor: "#10b981" }).showToast();
      } else {
          setTestStatus('error');
          Toastify({ text: result.message, duration: 8000, backgroundColor: "#ef4444", gravity: "top" }).showToast();
      }
  };

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'Current URL';

  return (
    <>
      <button onClick={() => setIsOpen(true)} className="fixed top-4 left-4 z-50 bg-dark-800 p-3 rounded-full text-brand-500 shadow-lg border border-dark-700 hover:scale-110 transition-transform">
         <i className="fa-solid fa-gear"></i>
      </button>

      {isOpen && (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-dark-900 border border-dark-800 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
          
          <div className="flex justify-between items-center p-6 border-b border-dark-800">
            <h2 className="text-2xl font-black text-white">System Configuration</h2>
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white"><i className="fa-solid fa-times text-xl"></i></button>
          </div>

          <div className="flex border-b border-dark-800">
             <button onClick={() => setActiveTab('wp')} className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider ${activeTab === 'wp' ? 'text-brand-500 border-b-2 border-brand-500' : 'text-gray-500 hover:text-gray-300'}`}>WordPress</button>
             <button onClick={() => setActiveTab('amazon')} className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider ${activeTab === 'amazon' ? 'text-brand-500 border-b-2 border-brand-500' : 'text-gray-500 hover:text-gray-300'}`}>Amazon API</button>
             <button onClick={() => setActiveTab('ai')} className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider ${activeTab === 'ai' ? 'text-brand-500 border-b-2 border-brand-500' : 'text-gray-500 hover:text-gray-300'}`}>AI Brain</button>
          </div>

          <form onSubmit={handleSubmit} className="p-8 overflow-y-auto">
            
            {/* WORDPRESS TAB */}
            {activeTab === 'wp' && (
                <div className="space-y-6 animate-fade-in">
                    <div className="flex justify-between items-center mb-4">
                        <p className="text-gray-400 text-sm">Connect your WordPress site via REST API.</p>
                        <button type="button" onClick={handleTestConnection} className={`text-xs font-bold px-3 py-1 rounded border ${testStatus === 'success' ? 'border-green-500 text-green-500' : 'border-gray-600 text-gray-400'}`}>
                            {testStatus === 'testing' ? <i className="fa-solid fa-spinner fa-spin"></i> : testStatus === 'success' ? 'Connected' : 'Test Connection'}
                        </button>
                    </div>

                    <div className="bg-dark-950 border border-yellow-900/50 p-4 rounded-xl">
                        <h4 className="text-yellow-500 text-xs font-bold uppercase mb-2"><i className="fa-solid fa-triangle-exclamation"></i> Critical CORS Setup</h4>
                        <p className="text-gray-400 text-xs mb-3 leading-relaxed">
                            To fix <strong>"CORS Blocked"</strong> errors:<br/>
                            1. In WP CORS Plugin, DELETE <code className="text-red-400">*</code> from Allowed Websites.<br/>
                            2. Paste the URL below.<br/>
                            3. Ensure 'Allow Credentials' is <code className="text-green-400">ON</code>.
                        </p>
                        <div className="flex gap-2">
                            <code className="flex-1 bg-black p-2 rounded text-xs text-brand-400 font-mono break-all border border-dark-700">
                                {currentOrigin}
                            </code>
                            <button
                                type="button"
                                onClick={() => { navigator.clipboard.writeText(currentOrigin); Toastify({text: "Copied!", backgroundColor: "#10b981"}).showToast(); }}
                                className="bg-dark-800 hover:bg-dark-700 text-white px-3 rounded text-xs font-bold border border-dark-700"
                            >
                                Copy
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs text-brand-500 font-bold uppercase mb-1 block">Site URL</label>
                        <input type="url" className="w-full bg-dark-950 border border-dark-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-500 outline-none" placeholder="https://mysite.com" value={config.wpUrl} onChange={e => setConfig({...config, wpUrl: e.target.value})} required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-brand-500 font-bold uppercase mb-1 block">Username</label>
                            <input type="text" className="w-full bg-dark-950 border border-dark-700 rounded-xl px-4 py-3 text-white outline-none" value={config.wpUser} onChange={e => setConfig({...config, wpUser: e.target.value})} required />
                        </div>
                        <div>
                            <label className="text-xs text-brand-500 font-bold uppercase mb-1 block">App Password</label>
                            <input type="password" className="w-full bg-dark-950 border border-dark-700 rounded-xl px-4 py-3 text-white outline-none" value={config.wpAppPassword} onChange={e => setConfig({...config, wpAppPassword: e.target.value})} required />
                        </div>
                    </div>
                </div>
            )}

            {/* AMAZON TAB */}
            {activeTab === 'amazon' && (
                <div className="space-y-6 animate-fade-in">
                    <p className="text-gray-400 text-sm">Configure Amazon Product Advertising API (PA-API 5.0). Keys are stored encrypted.</p>
                    <div className="bg-blue-900/20 border border-blue-800 p-3 rounded-lg">
                        <p className="text-xs text-blue-300">
                            <i className="fa-solid fa-shield-halved mr-2"></i>
                            <strong>Security Note:</strong> Keys are obfuscated in your browser storage. However, for maximum security, ensure you only use these on a trusted device.
                        </p>
                    </div>
                    <div>
                        <label className="text-xs text-brand-500 font-bold uppercase mb-1 block">Associate Tag</label>
                        <input type="text" className="w-full bg-dark-950 border border-dark-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-500 outline-none" placeholder="tag-20" value={config.amazonTag} onChange={e => setConfig({...config, amazonTag: e.target.value})} required />
                    </div>
                    <div>
                        <label className="text-xs text-brand-500 font-bold uppercase mb-1 block">Access Key ID</label>
                        <input type="text" className="w-full bg-dark-950 border border-dark-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-500 outline-none" placeholder="AKIA..." value={config.amazonAccessKey} onChange={e => setConfig({...config, amazonAccessKey: e.target.value})} />
                    </div>
                    <div>
                        <label className="text-xs text-brand-500 font-bold uppercase mb-1 block">Secret Access Key</label>
                        <input type="password" className="w-full bg-dark-950 border border-dark-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-500 outline-none" placeholder="Secret..." value={config.amazonSecretKey} onChange={e => setConfig({...config, amazonSecretKey: e.target.value})} />
                    </div>
                    <div>
                        <label className="text-xs text-brand-500 font-bold uppercase mb-1 block">Region</label>
                        <select 
                            className="w-full bg-dark-950 border border-dark-700 rounded-xl px-4 py-3 text-white outline-none appearance-none"
                            value={config.amazonRegion}
                            onChange={e => setConfig({...config, amazonRegion: e.target.value})}
                        >
                            <option value="us-east-1">United States (us-east-1)</option>
                            <option value="eu-west-1">United Kingdom (eu-west-1)</option>
                            <option value="eu-central-1">Germany (eu-central-1)</option>
                            <option value="eu-west-3">France (eu-west-3)</option>
                            <option value="eu-south-1">Italy (eu-south-1)</option>
                            <option value="eu-west-2">Spain (eu-west-2)</option>
                        </select>
                    </div>
                </div>
            )}

            {/* AI TAB */}
            {activeTab === 'ai' && (
                <div className="space-y-6 animate-fade-in">
                    <p className="text-gray-400 text-sm">Select your Intelligence Provider.</p>
                    
                    <div>
                        <label className="text-xs text-brand-500 font-bold uppercase mb-1 block">Provider</label>
                        <select 
                            className="w-full bg-dark-950 border border-dark-700 rounded-xl px-4 py-3 text-white outline-none appearance-none"
                            value={config.aiProvider}
                            onChange={e => setConfig({...config, aiProvider: e.target.value as AIProvider})}
                        >
                            <option value="gemini">Google Gemini (Recommended)</option>
                            <option value="openai">OpenAI (GPT-4)</option>
                            <option value="anthropic">Anthropic (Claude)</option>
                            <option value="groq">Groq (Ultra Fast)</option>
                            <option value="openrouter">OpenRouter (Universal)</option>
                        </select>
                    </div>

                    <div>
                        <label className="text-xs text-brand-500 font-bold uppercase mb-1 block">API Key</label>
                        <input 
                            type="password" 
                            className="w-full bg-dark-950 border border-dark-700 rounded-xl px-4 py-3 text-white outline-none" 
                            placeholder={config.aiProvider === 'gemini' ? "Use default or enter key..." : "sk-..."}
                            value={config.aiApiKey} 
                            onChange={e => setConfig({...config, aiApiKey: e.target.value})} 
                        />
                    </div>

                    <div>
                        <label className="text-xs text-brand-500 font-bold uppercase mb-1 block">Model ID</label>
                        {['groq', 'openrouter'].includes(config.aiProvider) ? (
                            <input 
                                type="text" 
                                className="w-full bg-dark-950 border border-dark-700 rounded-xl px-4 py-3 text-white outline-none" 
                                placeholder="e.g. llama3-70b-8192" 
                                value={config.aiModel}
                                onChange={e => setConfig({...config, aiModel: e.target.value})}
                            />
                        ) : (
                            <select 
                                className="w-full bg-dark-950 border border-dark-700 rounded-xl px-4 py-3 text-white outline-none"
                                value={config.aiModel}
                                onChange={e => setConfig({...config, aiModel: e.target.value})}
                            >
                                {config.aiProvider === 'gemini' && <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>}
                                {config.aiProvider === 'openai' && <option value="gpt-4-turbo">GPT-4 Turbo</option>}
                                {config.aiProvider === 'anthropic' && <option value="claude-3-opus-20240229">Claude 3 Opus</option>}
                            </select>
                        )}
                    </div>
                </div>
            )}

            <div className="pt-6 mt-6 border-t border-dark-800">
               <button type="submit" className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-4 rounded-xl shadow-lg transition-all">Save System Config</button>
            </div>
          </form>
        </div>
      </div>
      )}
    </>
  );
};