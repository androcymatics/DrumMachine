import { useState, useRef, useEffect, useCallback } from 'react';
import { generateLayer, searchSamples, getAudioPreviewUrl, getAudioDownloadUrl } from '../api';
import type { SampleCategory, GenerateLayerSettings } from '../types';
import { playCompletionSound } from '../utils/sounds';
import { ParticleBackground } from './ParticleBackground';

interface EasyModeProps {
  onGenerated?: () => void;
  onSoundGenerated?: (path: string, category: string) => void;
}

// Categories that should NOT have body pitch changes
const NO_PITCH_CATEGORIES: SampleCategory[] = ['kick', 'donk', '808'];

// Max saturation for easy mode (5%)
const MAX_SATURATION = 0.05;

// Preset settings for different sound types (no reverb in easy mode)
const SOUND_PRESETS: Record<SampleCategory, GenerateLayerSettings> = {
  kick: {
    bodySemitones: 0,
    transientGainDb: 3,
    textureHpHz: 300,
    saturation: 0.05,
    reverbMix: 0,
    clipperInGainDb: 6,
    clipperOutGainDb: -3,
    trimDb: -60,
    decayMs: 0,
    normalizePeakDb: -0.5,
  },
  snare: {
    bodySemitones: 0,
    transientGainDb: 4,
    textureHpHz: 400,
    saturation: 0.05,
    reverbMix: 0,
    clipperInGainDb: 4,
    clipperOutGainDb: -2,
    trimDb: -60,
    decayMs: 0,
    normalizePeakDb: -0.8,
  },
  hat: {
    bodySemitones: 2,
    transientGainDb: 2,
    textureHpHz: 800,
    saturation: 0.05,
    reverbMix: 0,
    clipperInGainDb: 2,
    clipperOutGainDb: 0,
    trimDb: -50,
    decayMs: 0,
    normalizePeakDb: -1,
  },
  clap: {
    bodySemitones: 0,
    transientGainDb: 5,
    textureHpHz: 500,
    saturation: 0.05,
    reverbMix: 0,
    clipperInGainDb: 4,
    clipperOutGainDb: -2,
    trimDb: -60,
    decayMs: 0,
    normalizePeakDb: -0.8,
  },
  perc: {
    bodySemitones: 0,
    transientGainDb: 3,
    textureHpHz: 600,
    saturation: 0.05,
    reverbMix: 0,
    clipperInGainDb: 3,
    clipperOutGainDb: -1,
    trimDb: -55,
    decayMs: 0,
    normalizePeakDb: -0.8,
  },
  '808': {
    bodySemitones: 0,
    transientGainDb: 2,
    textureHpHz: 200,
    saturation: 0.05,
    reverbMix: 0,
    clipperInGainDb: 8,
    clipperOutGainDb: -4,
    trimDb: -70,
    decayMs: 0,
    normalizePeakDb: -0.5,
  },
  donk: {
    bodySemitones: 0,
    transientGainDb: 4,
    textureHpHz: 400,
    saturation: 0.05,
    reverbMix: 0,
    clipperInGainDb: 6,
    clipperOutGainDb: -3,
    trimDb: -80,
    decayMs: 0,
    normalizePeakDb: -0.5,
  },
  other: {
    bodySemitones: 0,
    transientGainDb: 3,
    textureHpHz: 400,
    saturation: 0.05,
    reverbMix: 0,
    clipperInGainDb: 4,
    clipperOutGainDb: -2,
    trimDb: -60,
    decayMs: 0,
    normalizePeakDb: -0.8,
  },
};

const CATEGORY_ICONS: Record<SampleCategory | 'all', string> = {
  kick: '🥁',
  snare: '🪘',
  hat: '🎩',
  clap: '👏',
  perc: '🔔',
  '808': '🔊',
  donk: '💥',
  other: '🎵',
  all: '🌟',
};

// Categories to show in the selector (excluding 'other', adding 'all')
const DISPLAY_CATEGORIES: (SampleCategory | 'all')[] = ['kick', 'snare', 'hat', 'clap', 'perc', '808', 'donk', 'all'];

// Categories to pick from when 'all' is selected
const ALL_CATEGORIES: SampleCategory[] = ['kick', 'snare', 'hat', 'clap', 'perc', '808', 'donk'];

const BATCH_SIZES = [1, 2, 3, 5, 10];
const MAX_RECENTS = 20;

interface RecentSound {
  path: string;
  name: string;
  category: string;
}

export function EasyMode({ onGenerated, onSoundGenerated }: EasyModeProps) {
  const [selectedCategory, setSelectedCategory] = useState<SampleCategory | 'all'>('kick');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generationCount, setGenerationCount] = useState(0);
  const [batchSize, setBatchSize] = useState(1);
  const [generatingProgress, setGeneratingProgress] = useState({ current: 0, total: 0 });
  const [recentSounds, setRecentSounds] = useState<RecentSound[]>(() => {
    try {
      const saved = localStorage.getItem('recentSounds');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load recent sounds:', e);
    }
    return [];
  });
  const [playingRecentIndex, setPlayingRecentIndex] = useState<number | null>(null);
  const [clickRings, setClickRings] = useState<number[]>([]);
  const [isClicked, setIsClicked] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Save recents to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('recentSounds', JSON.stringify(recentSounds));
  }, [recentSounds]);

  const addToRecents = (path: string, category: string) => {
    const name = path.split('/').pop() || 'Unknown';
    setRecentSounds(prev => {
      const newRecent = { path, name, category };
      const updated = [newRecent, ...prev.filter(s => s.path !== path)];
      return updated.slice(0, MAX_RECENTS);
    });
  };

  // Play a specific recent sound (always plays, used by keyboard nav)
  const playRecentSound = useCallback((index: number) => {
    // Stop any current audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    const sound = recentSounds[index];
    if (!sound) return;
    
    const audio = new Audio(getAudioPreviewUrl(sound.path));
    audio.onended = () => {
      setPlayingRecentIndex(null);
    };
    audio.play().catch(() => {
      // Handle autoplay restrictions gracefully
      setPlayingRecentIndex(null);
    });
    audioRef.current = audio;
    setPlayingRecentIndex(index);
  }, [recentSounds]);

  // Click handler for recent items (toggles play/stop)
  const handlePlayRecent = (index: number) => {
    if (playingRecentIndex === index) {
      // Stop if clicking the same one
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingRecentIndex(null);
      return;
    }
    playRecentSound(index);
  };

  // Ref to track current index for keyboard navigation
  const keyboardIndexRef = useRef<number | null>(null);

  // Keyboard navigation for recents (up/down arrows)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if we have recent sounds
      if (recentSounds.length === 0) return;
      
      // Don't handle if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const currentIdx = keyboardIndexRef.current;
        const nextIndex = currentIdx === null ? 0 : Math.min(currentIdx + 1, recentSounds.length - 1);
        keyboardIndexRef.current = nextIndex;
        playRecentSound(nextIndex);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const currentIdx = keyboardIndexRef.current;
        const prevIndex = currentIdx === null ? recentSounds.length - 1 : Math.max(currentIdx - 1, 0);
        keyboardIndexRef.current = prevIndex;
        playRecentSound(prevIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [recentSounds.length, playRecentSound]);

  const handleGenerate = async () => {
    // Trigger click animation
    setIsClicked(true);
    const ringId = Date.now();
    setClickRings(prev => [...prev, ringId]);
    setTimeout(() => setIsClicked(false), 400);
    setTimeout(() => setClickRings(prev => prev.filter(id => id !== ringId)), 600);
    
    setGenerating(true);
    setError(null);

    // If "Drumkit" is selected, generate batchSize of EACH category
    const categoriesToGenerate: SampleCategory[] = selectedCategory === 'all' 
      ? ALL_CATEGORIES 
      : [selectedCategory];
    
    const totalGenerations = categoriesToGenerate.length * batchSize;
    setGeneratingProgress({ current: 0, total: totalGenerations });

    try {
      let currentProgress = 0;
      
      for (const category of categoriesToGenerate) {
        // Fetch samples from the category
        const samples = await searchSamples(undefined, category);

        if (samples.length < 2) {
          setError(`Need at least 2 samples in ${category} category. Add more samples in the Library tab!`);
          return;
        }

        // Track used combinations to avoid duplicates in batch
        const usedCombinations = new Set<string>();
        
        // Calculate max possible unique combinations (body × transient)
        const maxUniqueCombos = samples.length * (samples.length - 1);
        const actualBatchSize = Math.min(batchSize, maxUniqueCombos);

        // Generate batchSize samples for this category
        for (let i = 0; i < actualBatchSize; i++) {
          currentProgress++;
          setGeneratingProgress({ current: currentProgress, total: totalGenerations });

          // Find a unique body+transient combination
          let bodySample, transientSample, textureSample;
          let comboKey: string;
          let attempts = 0;
          const maxAttempts = 100;
          
          do {
            // Shuffle and pick random samples
            const shuffled = [...samples].sort(() => Math.random() - 0.5);
            bodySample = shuffled[0];
            transientSample = shuffled[1];
            comboKey = `${bodySample.id}-${transientSample.id}`;
            attempts++;
          } while (usedCombinations.has(comboKey) && attempts < maxAttempts);
          
          // Mark this combination as used
          usedCombinations.add(comboKey);
          
          // Optional texture (pick from remaining samples)
          const remainingSamples = samples.filter(s => s.id !== bodySample.id && s.id !== transientSample.id);
          textureSample = remainingSamples.length > 0 && Math.random() > 0.5 
            ? remainingSamples[Math.floor(Math.random() * remainingSamples.length)] 
            : undefined;

          // Get preset settings with slight randomization
          const baseSettings = SOUND_PRESETS[category];
          const noPitch = NO_PITCH_CATEGORIES.includes(category);
          
          const settings: GenerateLayerSettings = {
            ...baseSettings,
            // Add slight variations (but respect category restrictions)
            bodySemitones: noPitch ? 0 : baseSettings.bodySemitones + Math.floor(Math.random() * 5) - 2,
            transientGainDb: baseSettings.transientGainDb + Math.floor(Math.random() * 5) - 2,
            // Cap saturation at 5% for all easy mode generations
            saturation: Math.min(MAX_SATURATION, Math.max(0, baseSettings.saturation + (Math.random() * 0.03 - 0.015))),
            // No reverb in easy mode
            reverbMix: 0,
            clipperInGainDb: baseSettings.clipperInGainDb + Math.floor(Math.random() * 4) - 2,
          };

          // Generate without output folder (for download)
          const result = await generateLayer({
            bodyPath: bodySample.path,
            transientPath: transientSample.path,
            texturePath: textureSample?.path,
            settings,
            category: category,
          });

          setGenerationCount(prev => prev + 1);
          addToRecents(result.outputPath, category);
          onSoundGenerated?.(result.outputPath, category);
        }
      }
      
      // Play completion sound when all generations are done
      playCompletionSound();
      onGenerated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
      setGeneratingProgress({ current: 0, total: 0 });
    }
  };

  return (
    <div className="galaxy-bg fixed inset-0 overflow-hidden">
      {/* Particle animation layer - gently intensifies during generation */}
      <ParticleBackground 
        intensity={generating ? (generatingProgress.total > 0 ? (generatingProgress.current / generatingProgress.total) * 0.6 : 0.3) : 0}
        speedMultiplier={generating ? 1.2 + (generatingProgress.total > 0 ? (generatingProgress.current / generatingProgress.total) * 0.5 : 0.2) : 1}
      />
      
      {/* Content - Centered with slight offset down */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-6 px-4 h-screen overflow-hidden pt-16">
        {/* Title */}
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-2 drop-shadow-lg">Drum Machine</h2>
          <p className="text-gray-300">Pick a sound type and smash that button!</p>
        </div>

        {/* Category Selector */}
        <div className="flex flex-wrap justify-center gap-3 max-w-xl">
        {DISPLAY_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-6 py-4 rounded-xl text-lg font-semibold transition-all duration-200 flex items-center gap-2 ${
              selectedCategory === cat
                ? cat === 'all' 
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white scale-105 shadow-lg shadow-purple-500/30'
                  : 'bg-drum-accent text-white scale-105 shadow-lg shadow-drum-accent/30'
                : 'bg-drum-elevated text-drum-muted hover:bg-drum-surface hover:text-drum-text'
            }`}
          >
            <span className="text-2xl">{CATEGORY_ICONS[cat]}</span>
            <span className="capitalize">{cat === 'all' ? 'Drumkit' : cat}</span>
          </button>
        ))}
      </div>

      {/* Batch Size Selector */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-drum-muted">Generate</span>
        <select
          value={batchSize}
          onChange={(e) => setBatchSize(Number(e.target.value))}
          className="bg-drum-elevated text-drum-text px-3 py-1.5 rounded-lg border border-drum-border focus:border-orange-500 focus:outline-none font-semibold"
        >
          {BATCH_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <span className="text-drum-muted">
          {selectedCategory === 'all' 
            ? `× ${ALL_CATEGORIES.length} types`
            : `sample${batchSize !== 1 ? 's' : ''}`
          }
        </span>
      </div>

      {/* Big Generate Button */}
      <div className="relative">
        {/* Spinning ring while generating */}
        {generating && (
          <div className="absolute -inset-3 rounded-full generating-ring pointer-events-none" />
        )}
        
        {/* Expanding rings on click */}
        {clickRings.map(ringId => (
          <div
            key={ringId}
            className="absolute inset-0 rounded-full border-4 border-orange-400 generate-ring pointer-events-none"
          />
        ))}
        
        {/* Glow effect */}
        <div 
          className={`absolute inset-0 rounded-full bg-orange-500 blur-xl transition-opacity duration-300 ${
            generating ? 'opacity-50 animate-pulse' : isClicked ? 'opacity-70 generate-glow-burst' : 'opacity-30'
          }`} 
        />
        
        <button
          onClick={handleGenerate}
          disabled={generating}
          className={`relative w-48 h-48 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 
            text-white text-2xl font-bold shadow-2xl 
            transition-all duration-200 
            flex flex-col items-center justify-center gap-2
            ${generating 
              ? 'scale-95 opacity-80' 
              : isClicked
                ? 'generate-btn-clicked'
                : 'generate-btn-idle hover:scale-105 hover:shadow-orange-500/50'
            }`}
        >
          {generating ? (
            <>
              <span className="text-5xl animate-spin">⚡</span>
              <span className="text-lg">
                {generatingProgress.total > 1 
                  ? `${generatingProgress.current}/${generatingProgress.total}`
                  : 'Creating...'
                }
              </span>
            </>
          ) : (
            <>
              <span className={`text-5xl ${isClicked ? 'animate-bounce' : ''}`}>⚡</span>
              <span>GENERATE</span>
              {batchSize > 1 && <span className="text-sm font-normal">×{batchSize}</span>}
            </>
          )}
        </button>
      </div>

      {/* Generation Counter */}
      {generationCount > 0 && (
        <p className="text-drum-muted text-xs">
          {generationCount} sound{generationCount !== 1 ? 's' : ''} generated
        </p>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs max-w-sm text-center">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">×</button>
        </div>
      )}

      </div>

      {/* Floating Recents Panel - Fixed to right side */}
      {recentSounds.length > 0 && (
        <div className="fixed right-4 top-1/2 -translate-y-1/2 z-20 hidden lg:block">
          <div className="bg-drum-surface/90 backdrop-blur-xl border border-drum-border/50 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden w-64">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-500/20 to-purple-500/20 px-4 py-3 border-b border-drum-border/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-drum-text">Recents</span>
                  <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">
                    {recentSounds.length}
                  </span>
                </div>
                <button
                  onClick={() => setRecentSounds([])}
                  className="text-xs text-drum-muted hover:text-red-400 transition-colors"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-drum-muted mt-1">↑↓ to preview</p>
            </div>
            
            {/* Recents List */}
            <div className="max-h-80 overflow-y-auto">
              {recentSounds.map((sound, index) => (
                <div
                  key={sound.path}
                  className={`flex items-center gap-2 px-3 py-2 border-b border-drum-border/20 transition-all ${
                    playingRecentIndex === index 
                      ? 'bg-orange-500/15' 
                      : 'hover:bg-drum-elevated/50'
                  }`}
                >
                  <button
                    onClick={() => handlePlayRecent(index)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                      playingRecentIndex === index
                        ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                        : 'bg-drum-elevated hover:bg-orange-500/20 text-drum-muted hover:text-orange-400'
                    }`}
                  >
                    {playingRecentIndex === index ? '⏸' : '▶'}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-drum-text truncate text-xs">
                      {sound.name}
                    </div>
                    <div className="text-[10px] text-drum-muted capitalize">
                      {sound.category}
                    </div>
                  </div>
                  <a
                    href={getAudioDownloadUrl(sound.path)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center bg-drum-elevated hover:bg-orange-500/20 text-drum-muted hover:text-orange-400 transition-all flex-shrink-0"
                    download
                    title="Download"
                  >
                    ⬇
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Recents - Collapsed bottom bar */}
      {recentSounds.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 lg:hidden">
          <div className="bg-drum-surface/95 backdrop-blur-xl border border-drum-border/50 rounded-full shadow-2xl shadow-black/50 px-4 py-2 flex items-center gap-3">
            <span className="text-sm text-drum-text font-medium">{recentSounds.length} recent</span>
            {playingRecentIndex !== null ? (
              <button
                onClick={() => handlePlayRecent(playingRecentIndex)}
                className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center"
              >
                ⏸
              </button>
            ) : (
              <button
                onClick={() => handlePlayRecent(0)}
                className="w-8 h-8 rounded-full bg-drum-elevated text-drum-text flex items-center justify-center hover:bg-orange-500/20"
              >
                ▶
              </button>
            )}
            <a
              href={getAudioDownloadUrl(recentSounds[0]?.path)}
              className="w-8 h-8 rounded-full bg-drum-elevated text-drum-muted flex items-center justify-center hover:bg-orange-500/20 hover:text-orange-400"
              download
            >
              ⬇
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

