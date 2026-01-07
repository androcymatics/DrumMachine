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
  
  // Generated sounds history
  const [generatedSounds, setGeneratedSounds] = useState<GeneratedSound[]>([]);
  
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
    { id: 'library', label: 'Library', icon: '📚' },
    { id: 'generated', label: 'Generated', icon: '🎵', badge: generatedSounds.length || undefined },
    { id: 'easy', label: 'Easy Mode', icon: '🎯' },
    { id: 'generator', label: 'Generator', icon: '⚡' },
    { id: 'output', label: 'Output', icon: '📁' },
  ];

  const handleSelectForGenerator = (sample: Sample, slot: 'body' | 'transient' | 'texture') => {
    if (slot === 'body') setBodySample(sample);
    else if (slot === 'transient') setTransientSample(sample);
    else setTextureSample(sample);
    setActiveTab('generator');
  };

  return (
    <div className="min-h-screen bg-drum-bg">
      {/* Header */}
      <header className="bg-drum-surface border-b border-drum-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <span className="text-2xl font-light tracking-[0.3em] text-white">CYMATICS</span>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <div className={`w-2 h-2 rounded-full ${
                  backendConnected === null ? 'bg-yellow-500' :
                  backendConnected ? 'bg-green-500' : 'bg-red-500'
                }`} />
                <span className="text-drum-muted">
                  {backendConnected === null ? 'Connecting...' :
                   backendConnected ? 'Backend Connected' : 'Backend Offline'}
                </span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <nav className="flex gap-1 mt-4 relative">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 rounded-t-lg font-medium transition-all duration-150 flex items-center gap-2 ${
                  activeTab === tab.id
                    ? 'bg-drum-bg text-drum-accent border-t border-x border-drum-border'
                    : 'text-drum-muted hover:text-drum-text hover:bg-drum-elevated'
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
                {tab.badge && (
                  <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-drum-accent text-white">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className={`${activeTab === 'easy-mode' ? '' : 'max-w-7xl mx-auto px-4 py-6'}`}>
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

