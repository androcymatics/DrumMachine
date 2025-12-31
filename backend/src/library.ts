import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import type { Sample, SampleCategory, LibraryIndex } from './types.js';

const execAsync = promisify(exec);

// Allow persistent data dir override (e.g., Render disk at /data)
const DATA_DIR = process.env.DATA_DIR || process.cwd();
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json');
const SUPPORTED_EXTENSIONS = ['.wav', '.aiff', '.aif'];

// Category keywords for auto-detection
const CATEGORY_KEYWORDS: Record<SampleCategory, string[]> = {
  '808': ['808', 'tr808', 'tr-808', 'sub', 'subbass', 'sub bass', '808bass'],
  kick: ['kick', 'kik', 'bd', 'bass drum', 'bassdrum'],
  snare: ['snare', 'snr', 'sd', 'rim'],
  hat: ['hat', 'hh', 'hihat', 'hi-hat', 'cymbal', 'ride', 'crash'],
  clap: ['clap', 'clp', 'handclap'],
  perc: ['perc', 'percussion', 'tom', 'conga', 'bongo', 'shaker', 'tambourine', 'cowbell'],
  donk: ['donk', 'donks', 'bounce', 'boink', 'plonk'],
  other: []
};

function inferCategory(filename: string): SampleCategory {
  const lower = filename.toLowerCase();
  
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (category === 'other') continue;
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return category as SampleCategory;
      }
    }
  }
  
  return 'other';
}

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(path.dirname(LIBRARY_FILE), { recursive: true });
}

async function getAudioMetadata(filePath: string): Promise<{
  duration: number;
  sampleRate: number;
  channels: number;
  peakDb: number;
}> {
  try {
    // Use ffprobe to get audio metadata
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`
    );
    
    const data = JSON.parse(stdout);
    const stream = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'audio');
    const format = data.format;
    
    const duration = parseFloat(format?.duration || stream?.duration || '0');
    const sampleRate = parseInt(stream?.sample_rate || '44100', 10);
    const channels = parseInt(stream?.channels || '2', 10);
    
    // Get peak dB using ffmpeg volumedetect
    let peakDb = 0;
    try {
      const { stderr } = await execAsync(
        `ffmpeg -i "${filePath}" -af "volumedetect" -f null - 2>&1`
      );
      const peakMatch = stderr.match(/max_volume:\s*([-\d.]+)\s*dB/);
      if (peakMatch) {
        peakDb = parseFloat(peakMatch[1]);
      }
    } catch {
      // Volume detection failed, use default
    }
    
    return { duration, sampleRate, channels, peakDb };
  } catch (error) {
    console.error(`Error getting metadata for ${filePath}:`, error);
    return { duration: 0, sampleRate: 44100, channels: 2, peakDb: 0 };
  }
}

async function scanFolder(folderPath: string): Promise<string[]> {
  const files: string[] = [];
  
  async function walk(dir: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        // Skip hidden files and directories (starting with .)
        if (entry.name.startsWith('.')) {
          continue;
        }
        
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (SUPPORTED_EXTENSIONS.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dir}:`, error);
    }
  }
  
  await walk(folderPath);
  return files;
}

export async function loadLibrary(): Promise<LibraryIndex> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(LIBRARY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { folders: [], samples: [], lastUpdated: new Date().toISOString() };
  }
}

export async function saveLibrary(library: LibraryIndex): Promise<void> {
  library.lastUpdated = new Date().toISOString();
  await ensureDataDir();
  await fs.writeFile(LIBRARY_FILE, JSON.stringify(library, null, 2));
}

export async function addFolder(folderPath: string): Promise<{ added: number; total: number }> {
  // Verify folder exists
  const stats = await fs.stat(folderPath);
  if (!stats.isDirectory()) {
    throw new Error(`Path is not a directory: ${folderPath}`);
  }
  
  const library = await loadLibrary();
  
  // Check if folder already added
  if (library.folders.includes(folderPath)) {
    // Re-scan the folder
    library.samples = library.samples.filter(s => !s.path.startsWith(folderPath));
  } else {
    library.folders.push(folderPath);
  }
  
  // Scan for audio files
  console.log(`Scanning folder: ${folderPath}`);
  const files = await scanFolder(folderPath);
  console.log(`Found ${files.length} audio files`);
  
  let added = 0;
  for (const filePath of files) {
    // Skip if already in library
    if (library.samples.some(s => s.path === filePath)) {
      continue;
    }
    
    const metadata = await getAudioMetadata(filePath);
    const name = path.basename(filePath, path.extname(filePath));
    
    const sample: Sample = {
      id: uuidv4(),
      path: filePath,
      name,
      ...metadata,
      category: inferCategory(name)
    };
    
    library.samples.push(sample);
    added++;
    
    if (added % 10 === 0) {
      console.log(`Processed ${added} samples...`);
    }
  }
  
  await saveLibrary(library);
  
  return { added, total: library.samples.length };
}

export async function searchSamples(query?: string, category?: SampleCategory): Promise<Sample[]> {
  const library = await loadLibrary();
  let results = library.samples;
  
  if (category && category !== 'other') {
    results = results.filter(s => s.category === category);
  }
  
  if (query) {
    const lower = query.toLowerCase();
    results = results.filter(s => 
      s.name.toLowerCase().includes(lower) ||
      s.path.toLowerCase().includes(lower)
    );
  }
  
  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getSampleById(id: string): Promise<Sample | undefined> {
  const library = await loadLibrary();
  return library.samples.find(s => s.id === id);
}

export async function getFolders(): Promise<string[]> {
  const library = await loadLibrary();
  return library.folders;
}

export async function removeFolder(folderPath: string): Promise<void> {
  const library = await loadLibrary();
  library.folders = library.folders.filter(f => f !== folderPath);
  library.samples = library.samples.filter(s => !s.path.startsWith(folderPath));
  await saveLibrary(library);
}

