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

export interface LibraryIndex {
  folders: string[];
  samples: Sample[];
  lastUpdated: string;
}

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

export interface GenerateLayerRequest {
  bodyPath?: string;
  transientPath?: string;
  texturePath?: string;
  settings: GenerateLayerSettings;
  outputDir?: string;
  fileName?: string;
}

export interface GenerateLayerResponse {
  outputPath: string;
}

