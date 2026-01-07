import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
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
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });
  // Track selection by category and index within that category
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedIndexInCategory, setSelectedIndexInCategory] = useState<number>(-1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Refs for scrolling to elements
  const soundRefs = useRef<Record<string, HTMLDivElement | null>>({});

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

  // Play a sound and track its position
  const playSoundInCategory = useCallback((category: string, index: number, shouldScroll = false) => {
    const categorySounds = soundsByCategory[category];
    if (!categorySounds || index < 0 || index >= categorySounds.length) return;
    
    const sound = categorySounds[index];
    
    // Stop current audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    
    // Play new sound
    const audio = new Audio(getAudioPreviewUrl(sound.path));
    audio.onended = () => setPlayingId(null);
    audio.play();
    audioRef.current = audio;
    setPlayingId(sound.id);
    
    // Update selection
    setSelectedCategory(category);
    setSelectedIndexInCategory(index);
    
    // Scroll element into view if triggered by keyboard
    if (shouldScroll) {
      const refKey = `${category}-${index}`;
      const element = soundRefs.current[refKey];
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [soundsByCategory]);

  const handlePlay = (sound: GeneratedSound) => {
    // Find the category and index for this sound
    const category = CATEGORY_ORDER.includes(sound.category as SampleCategory) 
      ? sound.category 
      : 'other';
    const index = soundsByCategory[category].findIndex(s => s.id === sound.id);
    
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
    
    // Track the selection for keyboard navigation
    setSelectedCategory(category);
    setSelectedIndexInCategory(index);
  };

  // Keyboard navigation - up/down within current category column
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if not in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (sounds.length === 0) return;
      
      // If no category selected yet, select the first category with sounds
      if (!selectedCategory || !soundsByCategory[selectedCategory]?.length) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const firstCategory = activeCategories[0];
          if (firstCategory && soundsByCategory[firstCategory].length > 0) {
            playSoundInCategory(firstCategory, 0, true);
          }
        }
        return;
      }
      
      const categorySounds = soundsByCategory[selectedCategory];
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const newIndex = selectedIndexInCategory < categorySounds.length - 1 
          ? selectedIndexInCategory + 1 
          : 0; // Wrap to top
        playSoundInCategory(selectedCategory, newIndex, true);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const newIndex = selectedIndexInCategory > 0 
          ? selectedIndexInCategory - 1 
          : categorySounds.length - 1; // Wrap to bottom
        playSoundInCategory(selectedCategory, newIndex, true);
      } else if (e.key === 'ArrowLeft') {
        // Move to previous category column
        e.preventDefault();
        const currentCatIndex = activeCategories.indexOf(selectedCategory);
        const prevCatIndex = currentCatIndex > 0 ? currentCatIndex - 1 : activeCategories.length - 1;
        const prevCategory = activeCategories[prevCatIndex];
        if (prevCategory) {
          const newIndex = Math.min(selectedIndexInCategory, soundsByCategory[prevCategory].length - 1);
          playSoundInCategory(prevCategory, Math.max(0, newIndex), true);
        }
      } else if (e.key === 'ArrowRight') {
        // Move to next category column
        e.preventDefault();
        const currentCatIndex = activeCategories.indexOf(selectedCategory);
        const nextCatIndex = currentCatIndex < activeCategories.length - 1 ? currentCatIndex + 1 : 0;
        const nextCategory = activeCategories[nextCatIndex];
        if (nextCategory) {
          const newIndex = Math.min(selectedIndexInCategory, soundsByCategory[nextCategory].length - 1);
          playSoundInCategory(nextCategory, Math.max(0, newIndex), true);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sounds.length, selectedCategory, selectedIndexInCategory, soundsByCategory, activeCategories, playSoundInCategory]);

  // Reset selection when sounds are cleared
  useEffect(() => {
    if (sounds.length === 0) {
      setSelectedCategory(null);
      setSelectedIndexInCategory(-1);
    }
  }, [sounds.length]);

  const handleDownloadAll = async () => {
    if (sounds.length === 0 || downloading) return;
    
    setDownloading(true);
    setDownloadProgress({ current: 0, total: sounds.length });
    
    try {
      const zip = new JSZip();
      
      // Create folders for each category
      const folders: Record<string, JSZip | null> = {};
      
      for (let i = 0; i < sounds.length; i++) {
        const sound = sounds[i];
        setDownloadProgress({ current: i + 1, total: sounds.length });
        
        // Fetch the audio file
        const response = await fetch(getAudioDownloadUrl(sound.path));
        const blob = await response.blob();
        
        // Get or create category folder
        const category = sound.category.charAt(0).toUpperCase() + sound.category.slice(1);
        if (!folders[category]) {
          folders[category] = zip.folder(category);
        }
        
        // Add file to the category folder
        const fileName = sound.name.endsWith('.wav') ? sound.name : `${sound.name}.wav`;
        folders[category]?.file(fileName, blob);
      }
      
      // Generate and download the zip
      const content = await zip.generateAsync({ type: 'blob' });
      const timestamp = new Date().toISOString().slice(0, 10);
      saveAs(content, `Cymatics-Drums-${timestamp}.zip`);
      
    } catch (error) {
      console.error('Failed to download all:', error);
      alert('Failed to download. Please try again.');
    } finally {
      setDownloading(false);
      setDownloadProgress({ current: 0, total: 0 });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-drum-text">Generated Sounds</h2>
          <p className="text-drum-muted">
            {sounds.length === 0 
              ? 'No sounds generated yet. Try Drum Machine or Advanced!'
              : `${sounds.length} sound${sounds.length !== 1 ? 's' : ''} generated this session`
            }
          </p>
        </div>
        
        {sounds.length > 0 && (
          <div className="flex gap-2">
            <button
              onClick={handleDownloadAll}
              disabled={downloading}
              className="btn bg-drum-accent hover:bg-drum-accent-hover text-white"
            >
              {downloading 
                ? `📦 ${downloadProgress.current}/${downloadProgress.total}...` 
                : '📦 Download All'
              }
            </button>
            <button
              onClick={onClear}
              className="btn btn-ghost text-red-400 hover:bg-red-500/10 hover:text-red-300"
            >
              🗑️ Clear All
            </button>
          </div>
        )}
      </div>

      {/* Empty State */}
      {sounds.length === 0 && (
        <div className="card bg-drum-elevated/50 border-dashed border-2 border-drum-border">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-6xl mb-4">🎵</span>
            <h3 className="text-xl font-semibold text-drum-text mb-2">No sounds yet</h3>
            <p className="text-drum-muted max-w-md">
              Generated sounds will appear here. Head to <strong>Drum Machine</strong> for quick generation 
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
                {soundsByCategory[category].map((sound, index) => {
                  const isSelected = selectedCategory === category && selectedIndexInCategory === index;
                  const refKey = `${category}-${index}`;
                  return (
                  <div
                    key={sound.id}
                    ref={(el) => { soundRefs.current[refKey] = el; }}
                    className={`bg-drum-surface/50 rounded-lg p-2 transition-all ${
                      playingId === sound.id 
                        ? 'ring-2 ring-drum-accent bg-drum-accent/10' 
                        : isSelected 
                          ? 'ring-1 ring-drum-accent/50 bg-drum-accent/5' 
                          : 'hover:bg-drum-surface'
                    }`}
                  >
                    {/* Sound name */}
                    <div className="font-medium text-drum-text text-xs truncate mb-2" title={sound.name}>
                      {sound.name}
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
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tip */}
      {sounds.length > 0 && (
        <div className="flex justify-center pt-4">
          <p className="text-sm text-drum-muted">
            💡 Tip: Use <strong>↑↓</strong> to navigate within a column, <strong>←→</strong> to switch columns
          </p>
        </div>
      )}
    </div>
  );
}
