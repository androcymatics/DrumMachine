import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { getAudioPreviewUrl } from '../api';
import type { GeneratedSound } from './Generated';

interface SequencerProps {
  sounds: GeneratedSound[];
}

export interface SequencerRef {
  addTrackWithSound: (sound: GeneratedSound) => void;
}

interface Track {
  id: string;
  name: string;
  sound: GeneratedSound | null;
  steps: boolean[]; // 32 steps
  volume: number; // 0-1
}

const STEPS = 32;
const DEFAULT_BPM = 120;
const DEFAULT_CATEGORIES = ['kick', 'snare', 'hat', 'clap', 'perc', '808', 'donk'];

export const Sequencer = forwardRef<SequencerRef, SequencerProps>(({ sounds }, ref) => {
  const [tracks, setTracks] = useState<Track[]>(() => {
    // Initialize with 7 tracks, one for each category
    return DEFAULT_CATEGORIES.map((category, index) => ({
      id: `track-${category}-${index}`,
      name: category.charAt(0).toUpperCase() + category.slice(1),
      sound: null,
      steps: new Array(STEPS).fill(false),
      volume: 1,
    }));
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [bpm, setBpm] = useState(DEFAULT_BPM);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const intervalRef = useRef<number | null>(null);
  const stepIntervalRef = useRef<number | null>(null);
  const tracksRef = useRef<Track[]>([]);

  // Initialize audio context
  useEffect(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Load audio buffers for all sounds
  useEffect(() => {
    const loadBuffers = async () => {
      if (!audioContextRef.current) return;
      
      for (const sound of sounds) {
        if (!audioBuffersRef.current.has(sound.path)) {
          try {
            const response = await fetch(getAudioPreviewUrl(sound.path));
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
            audioBuffersRef.current.set(sound.path, audioBuffer);
          } catch (error) {
            console.error(`Failed to load audio for ${sound.name}:`, error);
          }
        }
      }
    };
    
    loadBuffers();
  }, [sounds]);

  // Keep tracksRef in sync
  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  // Add a new track
  const addTrack = useCallback(() => {
    const newTrack: Track = {
      id: `track-${Date.now()}`,
      name: `Track ${tracks.length + 1}`,
      sound: null,
      steps: new Array(STEPS).fill(false),
      volume: 1,
    };
    setTracks(prev => [...prev, newTrack]);
  }, [tracks.length]);

  // Remove a track
  const removeTrack = useCallback((trackId: string) => {
    setTracks(prev => prev.filter(t => t.id !== trackId));
  }, []);

  // Toggle a step
  const toggleStep = useCallback((trackIndex: number, stepIndex: number) => {
    setTracks(prev => {
      const updated = [...prev];
      updated[trackIndex].steps[stepIndex] = !updated[trackIndex].steps[stepIndex];
      return updated;
    });
  }, []);

  // Assign a sound to a track
  const assignSoundToTrack = useCallback((trackIndex: number, sound: GeneratedSound | null) => {
    setTracks(prev => {
      const updated = [...prev];
      updated[trackIndex].sound = sound;
      if (sound) {
        updated[trackIndex].name = sound.name;
      }
      return updated;
    });
  }, []);

  // Start/stop sequencer
  const togglePlay = useCallback(async () => {
    if (isPlaying) {
      // Stop
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (stepIntervalRef.current) {
        clearInterval(stepIntervalRef.current);
        stepIntervalRef.current = null;
      }
      setIsPlaying(false);
      setCurrentStep(0);
    } else {
      // Resume audio context if suspended (required for browser autoplay policy)
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        try {
          await audioContextRef.current.resume();
        } catch (error) {
          console.error('Failed to resume audio context:', error);
        }
      }
      
      // Start
      setIsPlaying(true);
      setCurrentStep(0);
      
      const stepDuration = (60 / bpm / 4) * 1000; // 16th notes
      
      // Play first step immediately
      tracksRef.current.forEach(track => {
        if (track.steps[0] && track.sound) {
          const buffer = audioBuffersRef.current.get(track.sound.path);
          if (buffer && audioContextRef.current) {
            try {
              const source = audioContextRef.current.createBufferSource();
              const gainNode = audioContextRef.current.createGain();
              source.buffer = buffer;
              gainNode.gain.value = track.volume;
              source.connect(gainNode);
              gainNode.connect(audioContextRef.current.destination);
              source.start(0);
            } catch (error) {
              console.error('Failed to play sound:', error);
            }
          }
        }
      });
      
      intervalRef.current = window.setInterval(() => {
        setCurrentStep(prev => {
          const nextStep = (prev + 1) % STEPS;
          // Play sounds for this step
          tracksRef.current.forEach(track => {
            if (track.steps[nextStep] && track.sound) {
              const buffer = audioBuffersRef.current.get(track.sound.path);
              if (buffer && audioContextRef.current) {
                try {
                  const source = audioContextRef.current.createBufferSource();
                  const gainNode = audioContextRef.current.createGain();
                  source.buffer = buffer;
                  gainNode.gain.value = track.volume;
                  source.connect(gainNode);
                  gainNode.connect(audioContextRef.current.destination);
                  source.start(0);
                } catch (error) {
                  console.error('Failed to play sound:', error);
                }
              }
            }
          });
          return nextStep;
        });
      }, stepDuration);
    }
  }, [isPlaying, bpm]);

  // Keyboard shortcut: spacebar to play/stop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        togglePlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (stepIntervalRef.current) {
        clearInterval(stepIntervalRef.current);
      }
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Step Sequencer</h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-drum-muted text-sm">BPM:</label>
            <input
              type="number"
              min="60"
              max="200"
              value={bpm}
              onChange={(e) => setBpm(Math.max(60, Math.min(200, parseInt(e.target.value) || 120)))}
              className="bg-drum-elevated text-drum-text px-3 py-1.5 rounded-lg border border-drum-border focus:border-orange-500 focus:outline-none w-20 text-center"
              disabled={isPlaying}
            />
          </div>
          <button
            onClick={togglePlay}
            className={`px-6 py-2 rounded-lg font-semibold transition-all ${
              isPlaying
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-orange-500 hover:bg-orange-600 text-white'
            }`}
          >
            {isPlaying ? '⏹ Stop' : '▶ Play'}
          </button>
        </div>
      </div>

      {/* Tracks */}
      <div className="space-y-4">
        {tracks.map((track, trackIndex) => (
          <div key={track.id} className="bg-drum-surface rounded-lg p-4 border border-drum-border">
            <div className="flex items-center gap-4 mb-3">
              {/* Track Info */}
              <div className="flex items-center gap-2 min-w-[200px]">
                <input
                  type="text"
                  value={track.name}
                  onChange={(e) => {
                    setTracks(prev => {
                      const updated = [...prev];
                      updated[trackIndex].name = e.target.value;
                      return updated;
                    });
                  }}
                  className="bg-drum-elevated text-drum-text px-2 py-1 rounded border border-drum-border focus:border-orange-500 focus:outline-none text-sm flex-1"
                  placeholder="Track name"
                />
              </div>

              {/* Sound Selector */}
              <select
                value={track.sound?.id || ''}
                onChange={(e) => {
                  const sound = sounds.find(s => s.id === e.target.value) || null;
                  assignSoundToTrack(trackIndex, sound);
                }}
                className="bg-drum-elevated text-drum-text px-3 py-1.5 rounded-lg border border-drum-border focus:border-orange-500 focus:outline-none text-sm min-w-[200px]"
              >
                <option value="">Select sound...</option>
                {sounds.map(sound => (
                  <option key={sound.id} value={sound.id}>
                    {sound.name} ({sound.category})
                  </option>
                ))}
              </select>

              {/* Volume */}
              <div className="flex items-center gap-2 min-w-[120px]">
                <label className="text-drum-muted text-sm">Vol:</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={track.volume * 100}
                  onChange={(e) => {
                    setTracks(prev => {
                      const updated = [...prev];
                      updated[trackIndex].volume = parseInt(e.target.value) / 100;
                      return updated;
                    });
                  }}
                  className="flex-1"
                />
                <span className="text-drum-text text-sm w-10 text-right">{Math.round(track.volume * 100)}%</span>
              </div>

              {/* Remove Track */}
              <button
                onClick={() => removeTrack(track.id)}
                className="text-drum-muted hover:text-red-400 transition-colors px-2"
                title="Remove track"
              >
                ✕
              </button>
            </div>

            {/* Steps Grid */}
            <div className="flex items-center gap-1">
              {track.steps.map((active, stepIndex) => (
                <button
                  key={stepIndex}
                  onClick={() => toggleStep(trackIndex, stepIndex)}
                  className={`w-10 h-10 rounded transition-all ${
                    active
                      ? 'bg-orange-500 hover:bg-orange-600'
                      : 'bg-drum-elevated hover:bg-drum-border border border-drum-border'
                  } ${
                    isPlaying && currentStep === stepIndex
                      ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-drum-bg'
                      : ''
                  }`}
                  title={`Step ${stepIndex + 1}`}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Add Track Button */}
        <button
          onClick={addTrack}
          className="w-full py-3 bg-drum-elevated hover:bg-drum-surface border border-drum-border rounded-lg text-drum-muted hover:text-white transition-all flex items-center justify-center gap-2"
        >
          <span>+</span>
          <span>Add Track</span>
        </button>
      </div>

      {/* Empty State */}
      {tracks.length === 0 && (
        <div className="text-center py-12 bg-drum-surface rounded-lg border border-drum-border">
          <p className="text-drum-muted mb-4">No tracks yet. Add a track to start sequencing!</p>
          <button
            onClick={addTrack}
            className="px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold transition-all"
          >
            Add Your First Track
          </button>
        </div>
      )}
    </div>
  );
});

