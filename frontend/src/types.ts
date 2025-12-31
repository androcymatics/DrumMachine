export interface Sample {
  id: string;
  path: string;
  name: string;
  duration: number;
  sampleRate: number;
  channels: number;
  peakDb: number;
  category: SampleCategory;
}

export type SampleCategory = 'kick' | 'snare' | 'hat' | 'clap' | 'perc' | '808' | 'donk' | 'other';

export interface GenerateLayerSettings {
  bodySemitones: number;
  transientGainDb: number;
  textureHpHz: number;
  saturation: number;
  reverbMix: number;
  clipperInGainDb: number;
  clipperOutGainDb: number;
  trimDb: number;
  decayMs: number;
  normalizePeakDb: number;
}

export interface OutputFile {
  path: string;
  name: string;
  size: number;
  createdAt: string;
}

export const CATEGORIES: SampleCategory[] = ['kick', 'snare', 'hat', 'clap', 'perc', '808', 'donk', 'other'];

export const CATEGORY_COLORS: Record<SampleCategory, string> = {
  kick: 'badge-kick',
  snare: 'badge-snare',
  hat: 'badge-hat',
  clap: 'badge-clap',
  perc: 'badge-perc',
  '808': 'badge-808',
  donk: 'badge-donk',
  other: 'badge-other'
};

