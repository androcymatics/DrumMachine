import { useState, useRef, useCallback, useEffect } from 'react';
import { generateLayer, getNextOutputNumber, getAudioPreviewUrl, getAudioDownloadUrl, searchSamples } from '../api';
import type { Sample, GenerateLayerSettings, SampleCategory } from '../types';
import { CATEGORY_COLORS, CATEGORIES } from '../types';

// Web Audio context for real-time preview
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

// Create a saturation curve for WaveShaperNode
function createSaturationCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 44100;
  const curve = new Float32Array(samples) as Float32Array<ArrayBuffer>;
  const deg = Math.PI / 180;
  const k = amount * 100;
  
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

// Create a soft clipping curve (tanh-based)
function createSoftClipCurve(): Float32Array<ArrayBuffer> {
  const samples = 44100;
  const curve = new Float32Array(samples) as Float32Array<ArrayBuffer>;
  
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    // Soft clip using tanh - provides smooth limiting
    curve[i] = Math.tanh(x * 1.5) * 0.95;
  }
  return curve;
}

interface GeneratorProps {
  bodySample: Sample | null;
  transientSample: Sample | null;
  textureSample: Sample | null;
  onSetBody: (sample: Sample) => void;
  onSetTransient: (sample: Sample) => void;
  onSetTexture: (sample: Sample) => void;
  onClearBody: () => void;
  onClearTransient: () => void;
  onClearTexture: () => void;
  outputDir: string;
  setOutputDir: (dir: string) => void;
  onGenerated: () => void;
}

const DEFAULT_SETTINGS: GenerateLayerSettings = {
  bodySemitones: 0,
  transientGainDb: 0,
  textureHpHz: 200,
  saturation: 0,
  reverbMix: 0,
  clipperInGainDb: 0,
  clipperOutGainDb: 0,
  trimDb: -60,
  decayMs: 0,
  normalizePeakDb: -0.8,
};

interface Preset {
  name: string;
  settings: GenerateLayerSettings;
  createdAt: string;
}

const PRESETS_STORAGE_KEY = 'drum-generator-presets';

// Built-in presets
const BUILT_IN_PRESETS: Preset[] = [
  {
    name: '🔥 Punchy Kick',
    settings: { bodySemitones: -2, transientGainDb: 4, textureHpHz: 300, saturation: 0.3, reverbMix: 0.1, clipperInGainDb: 6, clipperOutGainDb: -3, trimDb: -60, decayMs: 0, normalizePeakDb: -0.5 },
    createdAt: 'built-in'
  },
  {
    name: '🥁 Snappy Snare',
    settings: { bodySemitones: 0, transientGainDb: 6, textureHpHz: 500, saturation: 0.2, reverbMix: 0.25, clipperInGainDb: 4, clipperOutGainDb: -2, trimDb: -60, decayMs: 0, normalizePeakDb: -0.8 },
    createdAt: 'built-in'
  },
  {
    name: '✨ Crispy Hat',
    settings: { bodySemitones: 3, transientGainDb: 2, textureHpHz: 800, saturation: 0.15, reverbMix: 0.15, clipperInGainDb: 2, clipperOutGainDb: 0, trimDb: -50, decayMs: 0, normalizePeakDb: -1 },
    createdAt: 'built-in'
  },
  {
    name: '🌊 Washed Out',
    settings: { bodySemitones: -5, transientGainDb: -3, textureHpHz: 200, saturation: 0.4, reverbMix: 0.7, clipperInGainDb: 8, clipperOutGainDb: -6, trimDb: -70, decayMs: 0, normalizePeakDb: -0.8 },
    createdAt: 'built-in'
  },
  {
    name: '💥 Crushed',
    settings: { bodySemitones: 0, transientGainDb: 8, textureHpHz: 150, saturation: 0.8, reverbMix: 0.05, clipperInGainDb: 18, clipperOutGainDb: -12, trimDb: -60, decayMs: 0, normalizePeakDb: -0.3 },
    createdAt: 'built-in'
  },
  {
    name: '⚡ Tight & Short',
    settings: { bodySemitones: 0, transientGainDb: 3, textureHpHz: 400, saturation: 0.2, reverbMix: 0, clipperInGainDb: 4, clipperOutGainDb: -2, trimDb: -60, decayMs: 200, normalizePeakDb: -0.5 },
    createdAt: 'built-in'
  },
];

function loadPresetsFromStorage(): Preset[] {
  try {
    const stored = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load presets:', e);
  }
  return [];
}

function savePresetsToStorage(presets: Preset[]): void {
  try {
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
  } catch (e) {
    console.error('Failed to save presets:', e);
  }
}

export function Generator({
  bodySample,
  transientSample,
  textureSample,
  onSetBody,
  onSetTransient,
  onSetTexture,
  onClearBody,
  onClearTransient,
  onClearTexture,
  outputDir,
  setOutputDir,
  onGenerated,
}: GeneratorProps) {
  const [settings, setSettings] = useState<GenerateLayerSettings>(DEFAULT_SETTINGS);
  const [descriptor, setDescriptor] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [playingSlot, setPlayingSlot] = useState<string | null>(null);
  const [randomCategory, setRandomCategory] = useState<SampleCategory | 'all'>('all');
  const [randomizing, setRandomizing] = useState(false);
  const [showOutputSettings, setShowOutputSettings] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isDryPreviewing, setIsDryPreviewing] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [lockedParams, setLockedParams] = useState<Set<keyof GenerateLayerSettings>>(new Set());
  const [lockedSlots, setLockedSlots] = useState<Set<'body' | 'transient' | 'texture'>>(new Set());
  const [mutedSlots, setMutedSlots] = useState<Set<'body' | 'transient' | 'texture'>>(new Set());
  const [userPresets, setUserPresets] = useState<Preset[]>(() => loadPresetsFromStorage());
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  const toggleSlotMute = (slot: 'body' | 'transient' | 'texture') => {
    setMutedSlots(prev => {
      const next = new Set(prev);
      if (next.has(slot)) {
        next.delete(slot);
      } else {
        next.add(slot);
      }
      return next;
    });
  };

  const allPresets = [...BUILT_IN_PRESETS, ...userPresets];

  const savePreset = () => {
    if (!newPresetName.trim()) return;
    
    const newPreset: Preset = {
      name: newPresetName.trim(),
      settings: { ...settings },
      createdAt: new Date().toISOString()
    };
    
    const updated = [...userPresets, newPreset];
    setUserPresets(updated);
    savePresetsToStorage(updated);
    setNewPresetName('');
    setShowSavePreset(false);
  };

  const loadPreset = (preset: Preset) => {
    setSettings({ ...preset.settings });
  };

  const deletePreset = (presetToDelete: Preset) => {
    if (presetToDelete.createdAt === 'built-in') return;
    const updated = userPresets.filter(p => p.name !== presetToDelete.name || p.createdAt !== presetToDelete.createdAt);
    setUserPresets(updated);
    savePresetsToStorage(updated);
  };

  const toggleSlotLock = (slot: 'body' | 'transient' | 'texture') => {
    setLockedSlots(prev => {
      const next = new Set(prev);
      if (next.has(slot)) {
        next.delete(slot);
      } else {
        next.add(slot);
      }
      return next;
    });
  };
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggleLock = (param: keyof GenerateLayerSettings) => {
    setLockedParams(prev => {
      const next = new Set(prev);
      if (next.has(param)) {
        next.delete(param);
      } else {
        next.add(param);
      }
      return next;
    });
  };
  
  // Web Audio refs for real-time preview
  const previewNodesRef = useRef<{
    bodySource?: AudioBufferSourceNode;
    transientSource?: AudioBufferSourceNode;
    textureSource?: AudioBufferSourceNode;
    bodyGain?: GainNode;
    transientGain?: GainNode;
    textureGain?: GainNode;
    textureFilter?: BiquadFilterNode;
    saturation?: WaveShaperNode;
    reverbDry?: GainNode;
    reverbWet?: GainNode;
    reverbDelay1?: DelayNode;
    reverbDelay2?: DelayNode;
    reverbDelay3?: DelayNode;
    reverbFeedback1?: GainNode;
    reverbFeedback2?: GainNode;
    reverbFeedback3?: GainNode;
    clipperInGain?: GainNode;
    clipperShaper?: WaveShaperNode;
    clipperOutGain?: GainNode;
    decayGain?: GainNode;
    masterGain?: GainNode;
  }>({});
  const audioBuffersRef = useRef<{
    body?: AudioBuffer;
    transient?: AudioBuffer;
    texture?: AudioBuffer;
  }>({});

  // Load audio buffer from URL
  const loadAudioBuffer = useCallback(async (url: string): Promise<AudioBuffer> => {
    const ctx = getAudioContext();
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return await ctx.decodeAudioData(arrayBuffer);
  }, []);

  // Stop current preview
  const stopPreview = useCallback(() => {
    const nodes = previewNodesRef.current;
    try {
      nodes.bodySource?.stop();
      nodes.transientSource?.stop();
      nodes.textureSource?.stop();
    } catch {
      // Already stopped
    }
    nodes.bodySource?.disconnect();
    nodes.transientSource?.disconnect();
    nodes.textureSource?.disconnect();
    nodes.bodyGain?.disconnect();
    nodes.transientGain?.disconnect();
    nodes.textureGain?.disconnect();
    nodes.textureFilter?.disconnect();
    nodes.saturation?.disconnect();
    nodes.reverbDry?.disconnect();
    nodes.reverbWet?.disconnect();
    nodes.reverbDelay1?.disconnect();
    nodes.reverbDelay2?.disconnect();
    nodes.reverbDelay3?.disconnect();
    nodes.reverbFeedback1?.disconnect();
    nodes.reverbFeedback2?.disconnect();
    nodes.reverbFeedback3?.disconnect();
    nodes.clipperInGain?.disconnect();
    nodes.clipperShaper?.disconnect();
    nodes.clipperOutGain?.disconnect();
    nodes.decayGain?.disconnect();
    nodes.masterGain?.disconnect();
    previewNodesRef.current = {};
    setIsPreviewing(false);
    setIsDryPreviewing(false);
  }, []);

  // Start real-time preview with current settings
  const startPreview = useCallback(async () => {
    if (!bodySample || !transientSample) return;
    
    stopPreview();
    setLoadingPreview(true);
    
    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      
      // Load buffers if not cached or samples changed
      const buffers = audioBuffersRef.current;
      
      if (!buffers.body || buffers.body !== audioBuffersRef.current.body) {
        buffers.body = await loadAudioBuffer(getAudioPreviewUrl(bodySample.path));
      }
      if (!buffers.transient || buffers.transient !== audioBuffersRef.current.transient) {
        buffers.transient = await loadAudioBuffer(getAudioPreviewUrl(transientSample.path));
      }
      if (textureSample && !buffers.texture) {
        buffers.texture = await loadAudioBuffer(getAudioPreviewUrl(textureSample.path));
      }
      
      audioBuffersRef.current = buffers;
      
      // Create nodes
      const nodes = previewNodesRef.current;
      
      // Master gain and saturation
      nodes.masterGain = ctx.createGain();
      nodes.masterGain.gain.value = 0.8;
      
      nodes.saturation = ctx.createWaveShaper();
      nodes.saturation.curve = createSaturationCurve(settings.saturation);
      nodes.saturation.oversample = '2x';
      
      // Body source with pitch shift (using playbackRate)
      nodes.bodySource = ctx.createBufferSource();
      nodes.bodySource.buffer = buffers.body!;
      nodes.bodySource.playbackRate.value = Math.pow(2, settings.bodySemitones / 12);
      nodes.bodyGain = ctx.createGain();
      nodes.bodyGain.gain.value = 1;
      
      // Transient source with gain
      nodes.transientSource = ctx.createBufferSource();
      nodes.transientSource.buffer = buffers.transient!;
      nodes.transientGain = ctx.createGain();
      nodes.transientGain.gain.value = Math.pow(10, settings.transientGainDb / 20);
      
      // Connect body chain (respect mute)
      nodes.bodySource.connect(nodes.bodyGain);
      nodes.bodyGain.gain.value = mutedSlots.has('body') ? 0 : 1;
      nodes.bodyGain.connect(nodes.saturation);
      
      // Connect transient chain (respect mute)
      nodes.transientSource.connect(nodes.transientGain);
      nodes.transientGain.gain.value = mutedSlots.has('transient') 
        ? 0 
        : Math.pow(10, settings.transientGainDb / 20);
      nodes.transientGain.connect(nodes.saturation);
      
      // Texture with high-pass filter (if present and not muted)
      if (textureSample && buffers.texture) {
        nodes.textureSource = ctx.createBufferSource();
        nodes.textureSource.buffer = buffers.texture;
        nodes.textureFilter = ctx.createBiquadFilter();
        nodes.textureFilter.type = 'highpass';
        nodes.textureFilter.frequency.value = settings.textureHpHz;
        nodes.textureGain = ctx.createGain();
        nodes.textureGain.gain.value = mutedSlots.has('texture') ? 0 : 0.7;
        
        nodes.textureSource.connect(nodes.textureFilter);
        nodes.textureFilter.connect(nodes.textureGain);
        nodes.textureGain.connect(nodes.saturation);
      }
      
      // Create reverb effect (simple delay-based)
      nodes.reverbDry = ctx.createGain();
      nodes.reverbWet = ctx.createGain();
      nodes.reverbDelay1 = ctx.createDelay(1);
      nodes.reverbDelay2 = ctx.createDelay(1);
      nodes.reverbDelay3 = ctx.createDelay(1);
      nodes.reverbFeedback1 = ctx.createGain();
      nodes.reverbFeedback2 = ctx.createGain();
      nodes.reverbFeedback3 = ctx.createGain();
      
      // Set delay times for reverb-like effect
      nodes.reverbDelay1.delayTime.value = 0.06;
      nodes.reverbDelay2.delayTime.value = 0.12;
      nodes.reverbDelay3.delayTime.value = 0.18;
      nodes.reverbFeedback1.gain.value = 0.4;
      nodes.reverbFeedback2.gain.value = 0.3;
      nodes.reverbFeedback3.gain.value = 0.2;
      
      // Set wet/dry mix
      nodes.reverbDry.gain.value = 1 - (settings.reverbMix * 0.3);
      nodes.reverbWet.gain.value = settings.reverbMix * 0.6;
      
      // Connect reverb chain
      // Dry path (will be connected to clipper later)
      nodes.saturation.connect(nodes.reverbDry);
      
      // Wet path (parallel delays)
      nodes.saturation.connect(nodes.reverbDelay1);
      nodes.saturation.connect(nodes.reverbDelay2);
      nodes.saturation.connect(nodes.reverbDelay3);
      
      nodes.reverbDelay1.connect(nodes.reverbFeedback1);
      nodes.reverbDelay2.connect(nodes.reverbFeedback2);
      nodes.reverbDelay3.connect(nodes.reverbFeedback3);
      
      nodes.reverbFeedback1.connect(nodes.reverbWet);
      nodes.reverbFeedback2.connect(nodes.reverbWet);
      nodes.reverbFeedback3.connect(nodes.reverbWet);
      
      // Feedback loops for longer tail
      nodes.reverbFeedback1.connect(nodes.reverbDelay1);
      nodes.reverbFeedback2.connect(nodes.reverbDelay2);
      nodes.reverbFeedback3.connect(nodes.reverbDelay3);
      
      // Soft clipper chain - create nodes first
      nodes.clipperInGain = ctx.createGain();
      nodes.clipperInGain.gain.value = Math.pow(10, settings.clipperInGainDb / 20);
      
      nodes.clipperShaper = ctx.createWaveShaper();
      nodes.clipperShaper.curve = createSoftClipCurve();
      nodes.clipperShaper.oversample = '2x';
      
      nodes.clipperOutGain = ctx.createGain();
      nodes.clipperOutGain.gain.value = Math.pow(10, settings.clipperOutGainDb / 20);
      
      // Decay envelope gain
      nodes.decayGain = ctx.createGain();
      nodes.decayGain.gain.value = 1;
      
      // Connect clipper chain
      nodes.clipperInGain.connect(nodes.clipperShaper);
      nodes.clipperShaper.connect(nodes.clipperOutGain);
      nodes.clipperOutGain.connect(nodes.decayGain);
      nodes.decayGain.connect(nodes.masterGain);
      
      // Connect reverb outputs to clipper input
      nodes.reverbDry.connect(nodes.clipperInGain);
      nodes.reverbWet.connect(nodes.clipperInGain);
      
      nodes.masterGain.connect(ctx.destination);
      
      // Start playback
      const now = ctx.currentTime;
      nodes.bodySource.start(now);
      nodes.transientSource.start(now);
      nodes.textureSource?.start(now);
      
      // Calculate the max duration
      const maxDuration = Math.max(
        buffers.body!.duration / Math.pow(2, settings.bodySemitones / 12),
        buffers.transient!.duration,
        buffers.texture?.duration || 0
      );
      
      // Apply decay envelope if enabled
      if (settings.decayMs > 0) {
        const decaySeconds = settings.decayMs / 1000;
        // If decay is shorter than sample, fade out
        if (decaySeconds < maxDuration) {
          nodes.decayGain.gain.setValueAtTime(1, now);
          nodes.decayGain.gain.setValueAtTime(1, now + decaySeconds * 0.1); // Hold at full for 10%
          nodes.decayGain.gain.linearRampToValueAtTime(0, now + decaySeconds);
        }
      }
      
      setIsPreviewing(true);
      
      // Auto-stop based on decay or sample length
      const effectiveDuration = settings.decayMs > 0 
        ? Math.min(settings.decayMs / 1000 + 0.1, maxDuration)
        : maxDuration;
      
      setTimeout(() => {
        stopPreview();
      }, effectiveDuration * 1000 + 100);
      
    } catch (err) {
      console.error('Preview error:', err);
      setError('Failed to load preview: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoadingPreview(false);
    }
  }, [bodySample, transientSample, textureSample, settings, mutedSlots, loadAudioBuffer, stopPreview]);

  // Start dry preview (no effects)
  const startDryPreview = useCallback(async () => {
    if (!bodySample || !transientSample) return;
    
    stopPreview();
    setLoadingPreview(true);
    
    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      
      // Load buffers if not cached
      const buffers = audioBuffersRef.current;
      
      if (!buffers.body) {
        buffers.body = await loadAudioBuffer(getAudioPreviewUrl(bodySample.path));
      }
      if (!buffers.transient) {
        buffers.transient = await loadAudioBuffer(getAudioPreviewUrl(transientSample.path));
      }
      if (textureSample && !buffers.texture) {
        buffers.texture = await loadAudioBuffer(getAudioPreviewUrl(textureSample.path));
      }
      
      audioBuffersRef.current = buffers;
      
      // Create nodes - simple routing without effects
      const nodes = previewNodesRef.current;
      
      nodes.masterGain = ctx.createGain();
      nodes.masterGain.gain.value = 0.8;
      
      // Body source (no pitch shift for dry)
      nodes.bodySource = ctx.createBufferSource();
      nodes.bodySource.buffer = buffers.body!;
      nodes.bodyGain = ctx.createGain();
      nodes.bodyGain.gain.value = mutedSlots.has('body') ? 0 : 1;
      
      // Transient source (no extra gain for dry)
      nodes.transientSource = ctx.createBufferSource();
      nodes.transientSource.buffer = buffers.transient!;
      nodes.transientGain = ctx.createGain();
      nodes.transientGain.gain.value = mutedSlots.has('transient') ? 0 : 1;
      
      // Connect directly to master
      nodes.bodySource.connect(nodes.bodyGain);
      nodes.bodyGain.connect(nodes.masterGain);
      
      nodes.transientSource.connect(nodes.transientGain);
      nodes.transientGain.connect(nodes.masterGain);
      
      // Texture (no HP filter for dry)
      if (textureSample && buffers.texture) {
        nodes.textureSource = ctx.createBufferSource();
        nodes.textureSource.buffer = buffers.texture;
        nodes.textureGain = ctx.createGain();
        nodes.textureGain.gain.value = mutedSlots.has('texture') ? 0 : 0.7;
        
        nodes.textureSource.connect(nodes.textureGain);
        nodes.textureGain.connect(nodes.masterGain);
      }
      
      nodes.masterGain.connect(ctx.destination);
      
      // Start playback
      const now = ctx.currentTime;
      nodes.bodySource.start(now);
      nodes.transientSource.start(now);
      nodes.textureSource?.start(now);
      
      setIsDryPreviewing(true);
      
      // Auto-stop when longest sample ends
      const maxDuration = Math.max(
        buffers.body!.duration,
        buffers.transient!.duration,
        buffers.texture?.duration || 0
      );
      
      setTimeout(() => {
        stopPreview();
      }, maxDuration * 1000 + 100);
      
    } catch (err) {
      console.error('Dry preview error:', err);
      setError('Failed to load dry preview: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoadingPreview(false);
    }
  }, [bodySample, transientSample, textureSample, mutedSlots, loadAudioBuffer, stopPreview]);

  // Update preview parameters in real-time
  useEffect(() => {
    const nodes = previewNodesRef.current;
    
    if (nodes.bodySource && isPreviewing) {
      nodes.bodySource.playbackRate.value = Math.pow(2, settings.bodySemitones / 12);
    }
    if (nodes.bodyGain && isPreviewing) {
      nodes.bodyGain.gain.value = mutedSlots.has('body') ? 0 : 1;
    }
    if (nodes.transientGain && isPreviewing) {
      nodes.transientGain.gain.value = mutedSlots.has('transient') 
        ? 0 
        : Math.pow(10, settings.transientGainDb / 20);
    }
    if (nodes.textureFilter && isPreviewing) {
      nodes.textureFilter.frequency.value = settings.textureHpHz;
    }
    if (nodes.textureGain && isPreviewing) {
      nodes.textureGain.gain.value = mutedSlots.has('texture') ? 0 : 0.7;
    }
    if (nodes.saturation && isPreviewing) {
      nodes.saturation.curve = createSaturationCurve(settings.saturation);
    }
    if (nodes.reverbDry && nodes.reverbWet && isPreviewing) {
      nodes.reverbDry.gain.value = 1 - (settings.reverbMix * 0.3);
      nodes.reverbWet.gain.value = settings.reverbMix * 0.6;
    }
    if (nodes.clipperInGain && isPreviewing) {
      nodes.clipperInGain.gain.value = Math.pow(10, settings.clipperInGainDb / 20);
    }
    if (nodes.clipperOutGain && isPreviewing) {
      nodes.clipperOutGain.gain.value = Math.pow(10, settings.clipperOutGainDb / 20);
    }
  }, [settings, isPreviewing, mutedSlots]);

  // Clear buffers when samples change
  useEffect(() => {
    audioBuffersRef.current = {};
  }, [bodySample, transientSample, textureSample]);

  // Spacebar shortcut for preview
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger if spacebar and not typing in an input
      if (e.code === 'Space' && 
          !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        if (bodySample && transientSample && !loadingPreview) {
          if (isPreviewing) {
            stopPreview();
          } else {
            startPreview();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bodySample, transientSample, isPreviewing, loadingPreview, startPreview, stopPreview]);

  const handleRandomize = async () => {
    setRandomizing(true);
    setError(null);
    
    try {
      // Count how many unlocked slots we need to fill
      const unlockedSlots = [];
      if (!lockedSlots.has('body')) unlockedSlots.push('body');
      if (!lockedSlots.has('transient')) unlockedSlots.push('transient');
      if (!lockedSlots.has('texture')) unlockedSlots.push('texture');
      
      if (unlockedSlots.length === 0) {
        setError('All slots are locked! Unlock at least one to randomize.');
        return;
      }
      
      // Fetch samples from the selected category (or all)
      const samples = await searchSamples(
        undefined, 
        randomCategory === 'all' ? undefined : randomCategory
      );
      
      // Filter out currently locked samples to avoid duplicates
      const lockedSampleIds = new Set<string>();
      if (lockedSlots.has('body') && bodySample) lockedSampleIds.add(bodySample.id);
      if (lockedSlots.has('transient') && transientSample) lockedSampleIds.add(transientSample.id);
      if (lockedSlots.has('texture') && textureSample) lockedSampleIds.add(textureSample.id);
      
      const availableSamples = samples.filter(s => !lockedSampleIds.has(s.id));
      
      if (availableSamples.length < unlockedSlots.length) {
        setError(`Need at least ${unlockedSlots.length} samples in ${randomCategory === 'all' ? 'library' : randomCategory} category to randomize unlocked slots`);
        return;
      }
      
      // Shuffle and pick samples for unlocked slots
      const shuffled = [...availableSamples].sort(() => Math.random() - 0.5);
      let sampleIndex = 0;
      
      if (!lockedSlots.has('body')) {
        onSetBody(shuffled[sampleIndex++]);
      }
      if (!lockedSlots.has('transient')) {
        onSetTransient(shuffled[sampleIndex++]);
      }
      if (!lockedSlots.has('texture')) {
        // 50% chance to set texture, or always if it was already set
        if (textureSample || Math.random() > 0.5) {
          if (shuffled[sampleIndex]) {
            onSetTexture(shuffled[sampleIndex]);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to randomize');
    } finally {
      setRandomizing(false);
    }
  };

  const updateSetting = <K extends keyof GenerateLayerSettings>(
    key: K,
    value: GenerateLayerSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const randomizeSettings = () => {
    setSettings(prev => ({
      bodySemitones: prev.bodySemitones, // Keep current value
      transientGainDb: lockedParams.has('transientGainDb') ? prev.transientGainDb : Math.floor(Math.random() * 25) - 12,
      textureHpHz: lockedParams.has('textureHpHz') ? prev.textureHpHz : Math.floor(Math.random() * 1980) + 20,
      saturation: lockedParams.has('saturation') ? prev.saturation : Math.round(Math.random() * 100) / 100,
      reverbMix: prev.reverbMix, // Keep current value
      clipperInGainDb: lockedParams.has('clipperInGainDb') ? prev.clipperInGainDb : Math.floor(Math.random() * 24),
      clipperOutGainDb: lockedParams.has('clipperOutGainDb') ? prev.clipperOutGainDb : Math.floor(Math.random() * 30) - 24,
      trimDb: lockedParams.has('trimDb') ? prev.trimDb : Math.floor(Math.random() * 60) - 80,
      decayMs: lockedParams.has('decayMs') ? prev.decayMs : Math.floor(Math.random() * 20) * 100,
      normalizePeakDb: lockedParams.has('normalizePeakDb') ? prev.normalizePeakDb : Math.round((Math.random() * -6) * 10) / 10,
    }));
  };

  const randomizeSettingsSubtle = () => {
    setSettings(prev => ({
      bodySemitones: prev.bodySemitones, // Keep current value
      transientGainDb: lockedParams.has('transientGainDb') ? prev.transientGainDb : Math.floor(Math.random() * 13) - 6,
      textureHpHz: lockedParams.has('textureHpHz') ? prev.textureHpHz : Math.floor(Math.random() * 800) + 100,
      saturation: lockedParams.has('saturation') ? prev.saturation : Math.round(Math.random() * 50) / 100,
      reverbMix: prev.reverbMix, // Keep current value
      clipperInGainDb: lockedParams.has('clipperInGainDb') ? prev.clipperInGainDb : Math.floor(Math.random() * 12),
      clipperOutGainDb: lockedParams.has('clipperOutGainDb') ? prev.clipperOutGainDb : Math.floor(Math.random() * 12) - 12,
      trimDb: lockedParams.has('trimDb') ? prev.trimDb : -60,
      decayMs: lockedParams.has('decayMs') ? prev.decayMs : Math.floor(Math.random() * 5) * 100,
      normalizePeakDb: lockedParams.has('normalizePeakDb') ? prev.normalizePeakDb : -0.8,
    }));
  };

  const handlePlay = (sample: Sample | null, slot: string) => {
    if (!sample) return;
    
    if (audioRef.current) {
      audioRef.current.pause();
    }

    if (playingSlot === slot) {
      setPlayingSlot(null);
      return;
    }

    const audio = new Audio(getAudioPreviewUrl(sample.path));
    audio.onended = () => setPlayingSlot(null);
    audio.play();
    audioRef.current = audio;
    setPlayingSlot(slot);
  };

  const handleGenerate = async () => {
    if (!bodySample || !transientSample) {
      setError('Please select at least Body and Transient samples');
      return;
    }

    // Check if required layers are muted
    if (mutedSlots.has('body') && mutedSlots.has('transient')) {
      setError('Both Body and Transient are muted! Unmute at least one to generate.');
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      // Determine category from body sample (or transient if body is muted)
      const primarySample = mutedSlots.has('body') ? transientSample : bodySample;
      const category = primarySample.category.toUpperCase();
      const prefix = `ANDRO_${category}`;
      
      let fileName: string | undefined;
      
      // Only build custom filename if outputDir is set
      if (outputDir.trim()) {
        const nextNum = await getNextOutputNumber(outputDir, prefix);
        const numStr = String(nextNum).padStart(3, '0');
        fileName = descriptor.trim()
          ? `${prefix}_${descriptor.trim().replace(/\s+/g, '-')}_${numStr}.wav`
          : `${prefix}_${numStr}.wav`;
      }

      const result = await generateLayer({
        bodyPath: mutedSlots.has('body') ? undefined : bodySample.path,
        transientPath: mutedSlots.has('transient') ? undefined : transientSample.path,
        texturePath: (textureSample && !mutedSlots.has('texture')) ? textureSample.path : undefined,
        settings,
        outputDir: outputDir.trim() || undefined,
        fileName,
      });

      setLastGenerated(result.outputPath);
      setDescriptor('');
      
      // Only switch to output tab if we saved to a custom folder
      if (outputDir.trim()) {
        onGenerated();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handlePlayGenerated = () => {
    if (!lastGenerated) return;
    
    if (audioRef.current) {
      audioRef.current.pause();
    }

    if (playingSlot === 'generated') {
      setPlayingSlot(null);
      return;
    }

    const audio = new Audio(getAudioPreviewUrl(lastGenerated));
    audio.onended = () => setPlayingSlot(null);
    audio.play();
    audioRef.current = audio;
    setPlayingSlot('generated');
  };

  const canGenerate = bodySample && transientSample;

  return (
    <div className="space-y-6">
      {/* Randomize Section */}
      <div className="card bg-gradient-to-r from-drum-accent/10 to-drum-secondary/10 border-drum-accent/30">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🎲</span>
            <span className="font-semibold text-drum-text">Quick Fill</span>
          </div>
          
          <select
            value={randomCategory}
            onChange={(e) => setRandomCategory(e.target.value as SampleCategory | 'all')}
            className="input w-auto py-2 bg-drum-elevated"
          >
            <option value="all">All Categories</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat} className="capitalize">
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>
          
          <button
            onClick={handleRandomize}
            disabled={randomizing}
            className="btn btn-primary"
          >
            {randomizing ? (
              <>
                <span className="animate-spin">⏳</span> Randomizing...
              </>
            ) : (
              <>
                <span>🎲</span> Randomize Samples
              </>
            )}
          </button>
          
          <span className="text-sm text-drum-muted">
            {lockedSlots.size > 0 
              ? `🔒 ${lockedSlots.size} locked · Randomizing ${3 - lockedSlots.size} slot${3 - lockedSlots.size !== 1 ? 's' : ''}`
              : 'Auto-fills Body & Transient from your library'
            }
          </span>
        </div>
      </div>

      {/* Sample Slots */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SampleSlot
          label="Body"
          description="Main body/low-end of the sound"
          sample={bodySample}
          onClear={onClearBody}
          onPlay={() => handlePlay(bodySample, 'body')}
          isPlaying={playingSlot === 'body'}
          color="from-red-500/20 to-orange-500/20"
          locked={lockedSlots.has('body')}
          onToggleLock={() => toggleSlotLock('body')}
          muted={mutedSlots.has('body')}
          onToggleMute={() => toggleSlotMute('body')}
        />
        <SampleSlot
          label="Transient"
          description="Attack/click layer"
          sample={transientSample}
          onClear={onClearTransient}
          onPlay={() => handlePlay(transientSample, 'transient')}
          isPlaying={playingSlot === 'transient'}
          color="from-blue-500/20 to-cyan-500/20"
          locked={lockedSlots.has('transient')}
          onToggleLock={() => toggleSlotLock('transient')}
          muted={mutedSlots.has('transient')}
          onToggleMute={() => toggleSlotMute('transient')}
        />
        <SampleSlot
          label="Texture"
          description="Optional noise/character layer"
          sample={textureSample}
          onClear={onClearTexture}
          onPlay={() => handlePlay(textureSample, 'texture')}
          isPlaying={playingSlot === 'texture'}
          optional
          color="from-purple-500/20 to-pink-500/20"
          locked={lockedSlots.has('texture')}
          onToggleLock={() => toggleSlotLock('texture')}
          muted={mutedSlots.has('texture')}
          onToggleMute={() => toggleSlotMute('texture')}
        />
      </div>

      {/* Parameters */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <span>🎛️</span> Processing Parameters
          </h3>
          
          {/* Preset Controls */}
          <div className="flex items-center gap-2">
            <select
              onChange={(e) => {
                const preset = allPresets.find(p => p.name === e.target.value);
                if (preset) loadPreset(preset);
                e.target.value = '';
              }}
              className="input py-2 px-3 w-48 text-sm bg-drum-elevated"
              defaultValue=""
            >
              <option value="" disabled>Load Preset...</option>
              <optgroup label="Built-in">
                {BUILT_IN_PRESETS.map(p => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </optgroup>
              {userPresets.length > 0 && (
                <optgroup label="My Presets">
                  {userPresets.map(p => (
                    <option key={p.createdAt} value={p.name}>{p.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            
            <button
              onClick={() => setShowSavePreset(!showSavePreset)}
              className="btn btn-secondary text-sm py-2"
              title="Save current settings as preset"
            >
              💾 Save
            </button>
          </div>
        </div>

        {/* Save Preset Form */}
        {showSavePreset && (
          <div className="mb-4 p-3 bg-drum-surface rounded-lg flex gap-2">
            <input
              type="text"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="Preset name..."
              className="input py-2 flex-1"
              onKeyDown={(e) => e.key === 'Enter' && savePreset()}
              autoFocus
            />
            <button
              onClick={savePreset}
              disabled={!newPresetName.trim()}
              className="btn btn-primary py-2"
            >
              Save
            </button>
            <button
              onClick={() => { setShowSavePreset(false); setNewPresetName(''); }}
              className="btn btn-ghost py-2"
            >
              Cancel
            </button>
          </div>
        )}

        {/* User Presets Management */}
        {userPresets.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            <span className="text-sm text-drum-muted py-1">My Presets:</span>
            {userPresets.map(preset => (
              <div 
                key={preset.createdAt}
                className="flex items-center gap-1 bg-drum-elevated rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => loadPreset(preset)}
                  className="px-3 py-1 text-sm hover:bg-drum-accent/20 transition-colors"
                >
                  {preset.name}
                </button>
                <button
                  onClick={() => deletePreset(preset)}
                  className="px-2 py-1 text-red-400 hover:bg-red-500/20 transition-colors"
                  title="Delete preset"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Knob
            label="Body Pitch"
            value={settings.bodySemitones}
            min={-12}
            max={12}
            step={1}
            unit="st"
            onChange={(v) => updateSetting('bodySemitones', v)}
            locked={lockedParams.has('bodySemitones')}
            onToggleLock={() => toggleLock('bodySemitones')}
          />
          <Knob
            label="Trans Gain"
            value={settings.transientGainDb}
            min={-12}
            max={12}
            step={0.5}
            unit="dB"
            onChange={(v) => updateSetting('transientGainDb', v)}
            locked={lockedParams.has('transientGainDb')}
            onToggleLock={() => toggleLock('transientGainDb')}
          />
          <Knob
            label="Texture HP"
            value={settings.textureHpHz}
            min={20}
            max={2000}
            step={10}
            unit="Hz"
            onChange={(v) => updateSetting('textureHpHz', v)}
            locked={lockedParams.has('textureHpHz')}
            onToggleLock={() => toggleLock('textureHpHz')}
          />
          <Knob
            label="Saturation"
            value={settings.saturation}
            min={0}
            max={1}
            step={0.01}
            unit=""
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => updateSetting('saturation', v)}
            locked={lockedParams.has('saturation')}
            onToggleLock={() => toggleLock('saturation')}
          />
          <Knob
            label="Reverb"
            value={settings.reverbMix}
            min={0}
            max={1}
            step={0.05}
            unit=""
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => updateSetting('reverbMix', v)}
            locked={lockedParams.has('reverbMix')}
            onToggleLock={() => toggleLock('reverbMix')}
          />
          <Knob
            label="Clip In"
            value={settings.clipperInGainDb}
            min={0}
            max={24}
            step={0.5}
            unit="dB"
            onChange={(v) => updateSetting('clipperInGainDb', v)}
            locked={lockedParams.has('clipperInGainDb')}
            onToggleLock={() => toggleLock('clipperInGainDb')}
          />
          <Knob
            label="Clip Out"
            value={settings.clipperOutGainDb}
            min={-24}
            max={6}
            step={0.5}
            unit="dB"
            onChange={(v) => updateSetting('clipperOutGainDb', v)}
            locked={lockedParams.has('clipperOutGainDb')}
            onToggleLock={() => toggleLock('clipperOutGainDb')}
          />
          <Knob
            label="Trim Thresh"
            value={settings.trimDb}
            min={-80}
            max={-20}
            step={1}
            unit="dB"
            onChange={(v) => updateSetting('trimDb', v)}
            locked={lockedParams.has('trimDb')}
            onToggleLock={() => toggleLock('trimDb')}
          />
          <Knob
            label="Decay"
            value={settings.decayMs}
            min={0}
            max={2000}
            step={10}
            unit="ms"
            format={(v) => v === 0 ? 'Off' : `${v}ms`}
            onChange={(v) => updateSetting('decayMs', v)}
            locked={lockedParams.has('decayMs')}
            onToggleLock={() => toggleLock('decayMs')}
          />
          <Knob
            label="Norm Peak"
            value={settings.normalizePeakDb}
            min={-6}
            max={0}
            step={0.1}
            unit="dB"
            onChange={(v) => updateSetting('normalizePeakDb', v)}
            locked={lockedParams.has('normalizePeakDb')}
            onToggleLock={() => toggleLock('normalizePeakDb')}
          />
        </div>
        
        <div className="mt-4 pt-4 border-t border-drum-border flex flex-col items-center gap-3">
          {/* Preview Buttons */}
          <div className="flex gap-3">
            <button
              onClick={isDryPreviewing ? stopPreview : startDryPreview}
              disabled={!bodySample || !transientSample || loadingPreview || isPreviewing}
              className={`btn text-lg px-6 py-3 ${
                isDryPreviewing
                  ? 'bg-drum-muted text-white hover:bg-drum-muted/80'
                  : 'btn-ghost border-2 border-drum-border'
              } ${(!bodySample || !transientSample || isPreviewing) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {loadingPreview && !isPreviewing ? (
                <>
                  <span className="animate-spin">⏳</span> Loading...
                </>
              ) : isDryPreviewing ? (
                <>
                  <span>⏹</span> Stop
                </>
              ) : (
                <>
                  <span>🔈</span> Dry Preview
                </>
              )}
            </button>
            
            <button
              onClick={isPreviewing ? stopPreview : startPreview}
              disabled={!bodySample || !transientSample || loadingPreview || isDryPreviewing}
              className={`btn text-lg px-6 py-3 ${
                isPreviewing
                  ? 'bg-drum-secondary text-white hover:bg-drum-secondary/80'
                  : 'btn-secondary'
              } ${(!bodySample || !transientSample || isDryPreviewing) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {loadingPreview && !isDryPreviewing ? (
                <>
                  <span className="animate-spin">⏳</span> Loading...
                </>
              ) : isPreviewing ? (
                <>
                  <span>⏹</span> Stop Preview
                </>
              ) : (
                <>
                  <span>🔊</span> Preview with Effects
                </>
              )}
            </button>
          </div>
          
          {isPreviewing ? (
            <p className="text-sm text-drum-secondary animate-pulse">
              ♪ Adjust sliders to hear changes in real-time! Press <kbd className="px-2 py-0.5 bg-drum-elevated rounded text-xs">Space</kbd> to stop
            </p>
          ) : isDryPreviewing ? (
            <p className="text-sm text-drum-muted animate-pulse">
              ♪ Playing dry signal (no effects)
            </p>
          ) : (bodySample && transientSample) && (
            <p className="text-sm text-drum-muted">
              Press <kbd className="px-2 py-0.5 bg-drum-elevated rounded text-xs">Space</kbd> to preview with effects
            </p>
          )}
          
          <div className="flex gap-3 flex-wrap justify-center">
            <button
              onClick={randomizeSettingsSubtle}
              className="btn btn-secondary text-sm"
            >
              🎲 Randomize (Subtle)
            </button>
            <button
              onClick={randomizeSettings}
              className="btn btn-secondary text-sm"
            >
              🎲 Randomize (Wild)
            </button>
            <button
              onClick={() => setSettings(DEFAULT_SETTINGS)}
              className="btn btn-ghost text-sm"
            >
              ↺ Reset to Defaults
            </button>
          </div>
        </div>
      </div>

      {/* Output Settings (Collapsible) */}
      <div className="card">
        <button
          onClick={() => setShowOutputSettings(!showOutputSettings)}
          className="w-full flex items-center justify-between text-left"
        >
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <span>📁</span> Save to Folder
            <span className="text-sm font-normal text-drum-muted">(optional)</span>
          </h3>
          <span className="text-drum-muted text-xl">
            {showOutputSettings ? '−' : '+'}
          </span>
        </button>
        
        {!showOutputSettings && (
          <p className="text-sm text-drum-muted mt-2">
            Files will be available for download. Click to also save to a folder.
          </p>
        )}
        
        {showOutputSettings && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-drum-muted mb-2">Output Folder</label>
                <input
                  type="text"
                  value={outputDir}
                  onChange={(e) => setOutputDir(e.target.value)}
                  placeholder="/Users/andro/Samples/Generated"
                  className="input font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-drum-muted mb-2">Descriptor (optional)</label>
                <input
                  type="text"
                  value={descriptor}
                  onChange={(e) => setDescriptor(e.target.value)}
                  placeholder="e.g. Punchy, Dark, Bright"
                  className="input"
                />
              </div>
            </div>
            
            {outputDir.trim() && (
              <div className="text-sm text-drum-muted">
                Output name preview:{' '}
                <span className="font-mono text-drum-text">
                  ANDRO_{bodySample?.category.toUpperCase() || 'CATEGORY'}
                  {descriptor && `_${descriptor.replace(/\s+/g, '-')}`}_001.wav
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-4 underline">Dismiss</button>
        </div>
      )}

      {/* Generate Button */}
      <div className="flex flex-col items-center gap-4">
        <button
          onClick={handleGenerate}
          disabled={!canGenerate || generating}
          className={`btn text-lg px-12 py-4 ${
            canGenerate && !generating
              ? 'btn-primary animate-glow'
              : 'bg-drum-elevated text-drum-muted cursor-not-allowed'
          }`}
        >
          {generating ? (
            <>
              <span className="animate-spin">⏳</span> Generating...
            </>
          ) : (
            <>
              <span>⚡</span> Generate One-Shot
            </>
          )}
        </button>
        
        {!canGenerate && !generating && (
          <p className="text-sm text-drum-muted">
            {!bodySample && 'Select a Body sample. '}
            {!transientSample && 'Select a Transient sample.'}
          </p>
        )}
      </div>

      {/* Last Generated */}
      {lastGenerated && (
        <div className="card bg-gradient-to-r from-drum-secondary/20 to-drum-accent/10 border-drum-secondary/50">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex-1">
              <div className="text-lg text-drum-secondary font-semibold flex items-center gap-2">
                ✓ Ready to Download!
              </div>
              <div className="font-mono text-sm text-drum-text mt-1">
                {lastGenerated.split('/').pop()}
              </div>
              {outputDir.trim() && (
                <div className="text-xs text-drum-muted mt-1">
                  Also saved to: {lastGenerated}
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={handlePlayGenerated}
                className={`btn ${
                  playingSlot === 'generated'
                    ? 'btn-primary'
                    : 'btn-secondary'
                }`}
              >
                {playingSlot === 'generated' ? '⏹ Stop' : '▶ Preview'}
              </button>
              <a
                href={getAudioDownloadUrl(lastGenerated)}
                className="btn btn-primary text-lg px-6 animate-glow"
                download
              >
                ⬇ Download WAV
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface SampleSlotProps {
  label: string;
  description: string;
  sample: Sample | null;
  onClear: () => void;
  onPlay: () => void;
  isPlaying: boolean;
  optional?: boolean;
  color: string;
  locked?: boolean;
  onToggleLock?: () => void;
  muted?: boolean;
  onToggleMute?: () => void;
}

function SampleSlot({ label, description, sample, onClear, onPlay, isPlaying, optional, color, locked, onToggleLock, muted, onToggleMute }: SampleSlotProps) {
  return (
    <div className={`card bg-gradient-to-br ${color} border-2 ${
      muted ? 'opacity-50 border-drum-border' :
      locked ? 'border-drum-secondary/70 ring-2 ring-drum-secondary/30' : 
      sample ? 'border-drum-accent/50' : 'border-drum-border'
    } transition-opacity`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div>
            <h4 className="font-semibold text-drum-text flex items-center gap-2">
              {label}
              {muted && <span className="text-xs text-red-400 font-normal">(muted)</span>}
              {optional && !muted && <span className="text-xs text-drum-muted font-normal">(optional)</span>}
            </h4>
            <p className="text-xs text-drum-muted">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onToggleMute && sample && (
            <button
              onClick={onToggleMute}
              className={`text-sm w-7 h-7 rounded flex items-center justify-center transition-all ${
                muted 
                  ? 'bg-red-500/20 text-red-400' 
                  : 'bg-drum-elevated text-drum-muted hover:text-drum-text'
              }`}
              title={muted ? 'Unmute layer' : 'Mute layer'}
            >
              {muted ? '🔇' : '🔊'}
            </button>
          )}
          {onToggleLock && sample && (
            <button
              onClick={onToggleLock}
              className={`text-sm w-7 h-7 rounded flex items-center justify-center transition-all ${
                locked 
                  ? 'bg-drum-secondary/20 text-drum-secondary' 
                  : 'bg-drum-elevated text-drum-muted hover:text-drum-text'
              }`}
              title={locked ? 'Unlock (will be randomized)' : 'Lock (won\'t be randomized)'}
            >
              {locked ? '🔒' : '🔓'}
            </button>
          )}
          {sample && (
            <button
              onClick={onClear}
              className="text-drum-muted hover:text-red-400 transition-colors w-7 h-7 flex items-center justify-center"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      
      {sample ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={onPlay}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                isPlaying
                  ? 'bg-drum-accent text-white'
                  : 'bg-drum-elevated hover:bg-drum-accent/20'
              }`}
            >
              {isPlaying ? '⏹' : '▶'}
            </button>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-drum-text truncate">{sample.name}</div>
              <div className={`text-xs px-2 py-0.5 rounded border inline-block ${CATEGORY_COLORS[sample.category]}`}>
                {sample.category}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="h-16 flex items-center justify-center text-drum-muted text-sm border-2 border-dashed border-drum-border rounded-lg">
          Select from Library →
        </div>
      )}
    </div>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  format?: (v: number) => string;
  onChange: (value: number) => void;
  locked?: boolean;
  onToggleLock?: () => void;
}

function Knob({ label, value, min, max, step, unit, format, onChange, locked, onToggleLock }: SliderProps) {
  const percentage = ((value - min) / (max - min)) * 100;
  const displayValue = format ? format(value) : `${value}${unit}`;

  return (
    <div className={`bg-drum-elevated rounded-lg p-3 ${locked ? 'ring-2 ring-drum-secondary/50' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <label className="text-sm font-medium text-drum-text">{label}</label>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-mono ${locked ? 'text-drum-secondary' : 'text-drum-accent'}`}>
            {displayValue}
          </span>
          {onToggleLock && (
            <button
              onClick={onToggleLock}
              className={`text-xs w-6 h-6 rounded flex items-center justify-center transition-all ${
                locked 
                  ? 'bg-drum-secondary/20 text-drum-secondary' 
                  : 'bg-drum-surface text-drum-muted hover:text-drum-text'
              }`}
              title={locked ? 'Unlock (will be randomized)' : 'Lock (won\'t be randomized)'}
            >
              {locked ? '🔒' : '🔓'}
            </button>
          )}
        </div>
      </div>
      
      {/* Slider with custom styling */}
      <div className="relative">
        <div className="absolute inset-0 h-2 top-1/2 -translate-y-1/2 bg-drum-surface rounded-full overflow-hidden pointer-events-none">
          <div 
            className={`absolute left-0 top-0 h-full rounded-full transition-all duration-75 ${
              locked ? 'bg-drum-secondary' : 'bg-drum-accent'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="relative w-full h-6 appearance-none bg-transparent cursor-pointer z-10"
          style={{
            WebkitAppearance: 'none',
          }}
        />
      </div>
    </div>
  );
}

