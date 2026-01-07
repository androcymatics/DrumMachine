import { useState, useRef, useMemo } from 'react';
import { getAudioPreviewUrl, getAudioDownloadUrl } from '../api';
import type { SampleCategory } from '../types';

export interface GeneratedSound {
  id: string;
  path: string;
  name: string;
  category: string;
  createdAt: Date;
}

interface GeneratedProps {
  sounds: GeneratedSound[];
  onClear: () => void;
}

const CATEGORY_ORDER: SampleCategory[] = ['kick', 'snare', 'hat', 'clap', 'perc', '808', 'donk'];

const CATEGORY_ICONS: Record<string, string> = {
  kick: '🥁',
  snare: '🪘',
  hat: '🎩',
  clap: '👏',
  perc: '🔔',
  '808': '🔊',
  donk: '💥',
  other: '🎵',
};

const CATEGORY_COLORS: Record<string, string> = {
  kick: 'border-red-500/30 bg-red-500/10',
  snare: 'border-blue-500/30 bg-blue-500/10',
  hat: 'border-yellow-500/30 bg-yellow-500/10',
  clap: 'border-green-500/30 bg-green-500/10',
  perc: 'border-purple-500/30 bg-purple-500/10',
  '808': 'border-orange-500/30 bg-orange-500/10',
  donk: 'border-pink-500/30 bg-pink-500/10',
  other: 'border-gray-500/30 bg-gray-500/10',
};

export function Generated({ sounds, onClear }: GeneratedProps) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Group sounds by category
  const soundsByCategory = useMemo(() => {
    const grouped: Record<string, GeneratedSound[]> = {};
    
    // Initialize all categories
    CATEGORY_ORDER.forEach(cat => {
      grouped[cat] = [];
    });
    grouped['other'] = [];
    
    // Group sounds
    sounds.forEach(sound => {
      const cat = CATEGORY_ORDER.includes(sound.category as SampleCategory) 
        ? sound.category 
        : 'other';
      grouped[cat].push(sound);
    });
    
    return grouped;
  }, [sounds]);

  // Get categories that have sounds
  const activeCategories = useMemo(() => {
    return [...CATEGORY_ORDER, 'other'].filter(cat => soundsByCategory[cat].length > 0);
  }, [soundsByCategory]);

  const handlePlay = (sound: GeneratedSound) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }

    if (playingId === sound.id) {
      setPlayingId(null);
      return;
    }

    const audio = new Audio(getAudioPreviewUrl(sound.path));
    audio.onended = () => setPlayingId(null);
    audio.play();
    audioRef.current = audio;
    setPlayingId(sound.id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-drum-text">Generated Sounds</h2>
          <p className="text-drum-muted">
            {sounds.length === 0 
              ? 'No sounds generated yet. Try Drum Factory or Advanced!'
              : `${sounds.length} sound${sounds.length !== 1 ? 's' : ''} generated this session`
            }
          </p>
        </div>
        
        {sounds.length > 0 && (
          <button
            onClick={onClear}
            className="btn btn-ghost text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            🗑️ Clear All
          </button>
        )}
      </div>

      {/* Empty State */}
      {sounds.length === 0 && (
        <div className="card bg-drum-elevated/50 border-dashed border-2 border-drum-border">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-6xl mb-4">🎵</span>
            <h3 className="text-xl font-semibold text-drum-text mb-2">No sounds yet</h3>
            <p className="text-drum-muted max-w-md">
              Generated sounds will appear here. Head to <strong>Drum Factory</strong> for quick generation 
              or <strong>Advanced</strong> for full control.
            </p>
          </div>
        </div>
      )}

      {/* Category Columns */}
      {sounds.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
          {activeCategories.map(category => (
            <div 
              key={category}
              className={`rounded-xl border ${CATEGORY_COLORS[category]} p-3`}
            >
              {/* Category Header */}
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/10">
                <span className="text-xl">{CATEGORY_ICONS[category]}</span>
                <span className="font-semibold text-drum-text capitalize">{category}</span>
                <span className="ml-auto text-xs text-drum-muted bg-drum-surface px-2 py-0.5 rounded-full">
                  {soundsByCategory[category].length}
                </span>
              </div>
              
              {/* Sounds in this category */}
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {soundsByCategory[category].map((sound) => (
                  <div
                    key={sound.id}
                    className={`bg-drum-surface/50 rounded-lg p-2 transition-all ${
                      playingId === sound.id ? 'ring-2 ring-drum-accent bg-drum-accent/10' : 'hover:bg-drum-surface'
                    }`}
                  >
                    {/* Sound name */}
                    <div className="font-medium text-drum-text text-xs truncate mb-2" title={sound.name}>
                      {sound.name.replace(/^Cymatics - \w+ - /, '')}
                    </div>
                    
                    {/* Actions */}
                    <div className="flex gap-1">
                      <button
                        onClick={() => handlePlay(sound)}
                        className={`flex-1 py-1.5 px-2 rounded text-xs font-medium transition-all ${
                          playingId === sound.id
                            ? 'bg-drum-accent text-white'
                            : 'bg-drum-elevated hover:bg-drum-accent/20 text-drum-text'
                        }`}
                      >
                        {playingId === sound.id ? '⏹' : '▶'}
                      </button>
                      <a
                        href={getAudioDownloadUrl(sound.path)}
                        className="py-1.5 px-2 rounded text-xs font-medium bg-drum-elevated hover:bg-drum-accent/20 text-drum-text transition-all"
                        download
                        title="Download"
                      >
                        ⬇
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tip */}
      {sounds.length > 1 && (
        <div className="flex justify-center pt-4">
          <p className="text-sm text-drum-muted">
            💡 Tip: Use <strong>All Types</strong> in Drum Factory to quickly fill all columns
          </p>
        </div>
      )}
    </div>
  );
}
