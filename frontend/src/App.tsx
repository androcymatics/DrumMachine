import { useState, useEffect, useCallback } from 'react';
import { Library } from './components/Library';
import { Generator } from './components/Generator';
import { EasyMode } from './components/EasyMode';
import { Generated, GeneratedSound } from './components/Generated';
import { Output } from './components/Output';
import { healthCheck } from './api';
import type { Sample } from './types';

type Tab = 'library' | 'generated' | 'easy' | 'generator' | 'output';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('easy');
  const [backendConnected, setBackendConnected] = useState<boolean | null>(null);
  const [outputDir, setOutputDir] = useState<string>('');
  
  // Selected samples for generator
  const [bodySample, setBodySample] = useState<Sample | null>(null);
  const [transientSample, setTransientSample] = useState<Sample | null>(null);
  const [textureSample, setTextureSample] = useState<Sample | null>(null);
  
  // Generated sounds history - load from localStorage
  const [generatedSounds, setGeneratedSounds] = useState<GeneratedSound[]>(() => {
    try {
      const saved = localStorage.getItem('generatedSounds');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Convert date strings back to Date objects
        return parsed.map((s: GeneratedSound & { createdAt: string }) => ({
          ...s,
          createdAt: new Date(s.createdAt)
        }));
      }
    } catch (e) {
      console.error('Failed to load generated sounds:', e);
    }
    return [];
  });
  
  // Save generated sounds to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('generatedSounds', JSON.stringify(generatedSounds));
  }, [generatedSounds]);
  
  const addGeneratedSound = useCallback((path: string, category: string) => {
    const name = path.split('/').pop() || 'Unknown';
    const newSound: GeneratedSound = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      path,
      name,
      category,
      createdAt: new Date(),
    };
    setGeneratedSounds(prev => [newSound, ...prev]);
  }, []);
  
  const clearGeneratedSounds = useCallback(() => {
    setGeneratedSounds([]);
  }, []);

  useEffect(() => {
    const checkBackend = async () => {
      const connected = await healthCheck();
      setBackendConnected(connected);
    };
    
    checkBackend();
    const interval = setInterval(checkBackend, 10000);
    return () => clearInterval(interval);
  }, []);

  const tabs: { id: Tab; label: string; icon: string; badge?: number }[] = [
    { id: 'easy', label: 'Drum Machine', icon: '🥁' },
    { id: 'generator', label: 'Advanced', icon: '⚡' },
    { id: 'generated', label: 'Generated', icon: '🎵', badge: generatedSounds.length || undefined },
    { id: 'library', label: 'Library', icon: '📚' },
  ];

  const handleSelectForGenerator = (sample: Sample, slot: 'body' | 'transient' | 'texture') => {
    if (slot === 'body') setBodySample(sample);
    else if (slot === 'transient') setTransientSample(sample);
    else setTextureSample(sample);
    setActiveTab('generator');
  };

  return (
    <div className={`min-h-screen ${activeTab === 'easy' ? 'bg-[#0f0a1a]' : 'bg-drum-bg'}`}>
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-drum-bg/80 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4">
          {/* Top bar */}
          <div className="flex items-center justify-between py-4">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-pink-500 blur-lg opacity-20" />
                <span className="relative text-2xl font-black tracking-wider bg-gradient-to-r from-orange-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
                  CYMATICS
                </span>
              </div>
              <span className="text-xs font-medium text-drum-muted bg-drum-elevated px-2 py-1 rounded-full">
                DRUM MACHINE
              </span>
            </div>
            
            {/* Status */}
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full ${
                backendConnected === null 
                  ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' 
                  : backendConnected 
                    ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                  backendConnected === null ? 'bg-yellow-400' :
                  backendConnected ? 'bg-green-400' : 'bg-red-400'
                }`} />
                {backendConnected === null ? 'Connecting' :
                 backendConnected ? 'Online' : 'Offline'}
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex gap-2 pb-3">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 flex items-center gap-2 ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow-lg shadow-orange-500/25'
                    : 'text-drum-muted hover:text-white hover:bg-white/5'
                }`}
              >
                <span className="text-base">{tab.icon}</span>
                {tab.label}
                {tab.badge && (
                  <span className={`ml-1 px-2 py-0.5 text-xs rounded-full font-bold ${
                    activeTab === tab.id 
                      ? 'bg-white/20 text-white' 
                      : 'bg-drum-accent/20 text-drum-accent'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className={`${activeTab === 'easy' ? '' : 'max-w-7xl mx-auto px-4 py-6'}`}>
        {!backendConnected && backendConnected !== null && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
            <p className="font-medium">⚠️ Backend not connected</p>
            <p className="text-sm mt-1">
              Make sure the backend server is running on port 3001. 
              Run <code className="bg-drum-elevated px-2 py-1 rounded">npm run dev</code> in the backend folder.
            </p>
          </div>
        )}

        {activeTab === 'library' && (
          <Library 
            onSelectForGenerator={handleSelectForGenerator}
            selectedBody={bodySample}
            selectedTransient={transientSample}
            selectedTexture={textureSample}
          />
        )}

        {activeTab === 'generated' && (
          <Generated 
            sounds={generatedSounds}
            onClear={clearGeneratedSounds}
          />
        )}

        {activeTab === 'easy' && (
          <EasyMode 
            onSoundGenerated={addGeneratedSound}
          />
        )}
        
        {activeTab === 'generator' && (
          <Generator
            bodySample={bodySample}
            transientSample={transientSample}
            textureSample={textureSample}
            onSetBody={setBodySample}
            onSetTransient={setTransientSample}
            onSetTexture={setTextureSample}
            onClearBody={() => setBodySample(null)}
            onClearTransient={() => setTransientSample(null)}
            onClearTexture={() => setTextureSample(null)}
            outputDir={outputDir}
            setOutputDir={setOutputDir}
            onGenerated={() => setActiveTab('output')}
          />
        )}
        
        {activeTab === 'output' && (
          <Output outputDir={outputDir} setOutputDir={setOutputDir} />
        )}
      </main>
    </div>
  );
}

export default App;

