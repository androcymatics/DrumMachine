import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import type { GenerateLayerRequest, GenerateLayerResponse } from './types.js';

const execAsync = promisify(exec);

// Default temp output directory for downloads
const TEMP_OUTPUT_DIR = path.join(tmpdir(), 'drum-generator-output');

// Counter for unique filenames in temp mode
let tempFileCounter = 0;

async function checkFFmpeg(): Promise<boolean> {
  try {
    await execAsync('ffmpeg -version');
    return true;
  } catch {
    return false;
  }
}

export async function generateLayeredSample(
  request: GenerateLayerRequest
): Promise<GenerateLayerResponse> {
  const { bodyPath, transientPath, texturePath, settings } = request;
  let { outputDir, fileName } = request;

  // Check FFmpeg availability
  if (!(await checkFFmpeg())) {
    throw new Error('FFmpeg is not installed or not in PATH');
  }

  // Need at least one of body or transient
  if (!bodyPath && !transientPath) {
    throw new Error('At least one of bodyPath or transientPath must be provided');
  }

  // Verify input files exist
  for (const filePath of [bodyPath, transientPath, texturePath].filter(Boolean)) {
    try {
      await fs.access(filePath!);
    } catch {
      throw new Error(`Input file not found: ${filePath}`);
    }
  }

  // Use temp directory if no output dir specified
  const useTemp = !outputDir || outputDir.trim() === '';
  if (useTemp) {
    outputDir = TEMP_OUTPUT_DIR;
    // Generate a unique filename if none provided
    if (!fileName || fileName.trim() === '') {
      tempFileCounter++;
      const timestamp = Date.now();
      const categoryLabel = request.category 
        ? request.category.charAt(0).toUpperCase() + request.category.slice(1)
        : 'Generated';
      fileName = `ANDRO_${categoryLabel}_${timestamp}_${tempFileCounter}.wav`;
    }
  }

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, fileName);

  // Build FFmpeg command
  const inputs: string[] = [];
  const filterParts: string[] = [];
  let streamIndex = 0;
  const layerNames: string[] = [];

  // Body sample with pitch shift (if not muted)
  if (bodyPath) {
    inputs.push(`-i "${bodyPath}"`);
    const pitchFactor = Math.pow(2, settings.bodySemitones / 12);
    filterParts.push(
      `[${streamIndex}:a]asetrate=44100*${pitchFactor},aresample=44100,aformat=sample_fmts=fltp[body]`
    );
    layerNames.push('[body]');
    streamIndex++;
  }

  // Transient sample with gain (if not muted)
  if (transientPath) {
    inputs.push(`-i "${transientPath}"`);
    const transientGainLinear = Math.pow(10, settings.transientGainDb / 20);
    filterParts.push(
      `[${streamIndex}:a]volume=${transientGainLinear},aformat=sample_fmts=fltp[transient]`
    );
    layerNames.push('[transient]');
    streamIndex++;
  }

  // Optional texture sample with high-pass filter
  if (texturePath) {
    inputs.push(`-i "${texturePath}"`);
    filterParts.push(
      `[${streamIndex}:a]highpass=f=${settings.textureHpHz},aformat=sample_fmts=fltp[texture]`
    );
    layerNames.push('[texture]');
    streamIndex++;
  }

  // Mix all streams together (or pass through if only one)
  if (layerNames.length === 1) {
    // Single layer - just rename it to [mixed]
    const singleLayer = layerNames[0].replace('[', '').replace(']', '');
    filterParts.push(`[${singleLayer}]acopy[mixed]`);
  } else {
    // Multiple layers - mix them
    const mixInputs = layerNames.join('');
    filterParts.push(`${mixInputs}amix=inputs=${layerNames.length}:duration=longest:normalize=0[mixed]`);
  }

  // Apply saturation (using atan soft clipping)
  // saturation 0 = no effect, saturation 1 = heavy saturation
  const satDrive = 1 + settings.saturation * 4; // 1 to 5
  filterParts.push(
    `[mixed]volume=${satDrive},alimiter=limit=1:attack=0.1:release=50[saturated]`
  );

  // Apply reverb using aecho (room-like reverb simulation)
  // reverbMix 0 = dry, 1 = fully wet
  const reverbMix = settings.reverbMix || 0;
  if (reverbMix > 0) {
    // Create a reverb-like effect with multiple delays
    // in_gain=1, out_gain=mix, delays, decays
    const wetGain = reverbMix * 0.6;
    const dryGain = 1 - (reverbMix * 0.3);
    filterParts.push(
      `[saturated]aecho=in_gain=${dryGain}:out_gain=${wetGain}:delays=60|120|180:decays=0.4|0.3|0.2[reverbed]`
    );
  } else {
    filterParts.push(`[saturated]acopy[reverbed]`);
  }

  // Soft clipper with input and output gain
  const clipperInGain = Math.pow(10, (settings.clipperInGainDb || 0) / 20);
  const clipperOutGain = Math.pow(10, (settings.clipperOutGainDb || 0) / 20);
  // Use volume for input gain, alimiter for soft clipping, volume for output gain
  filterParts.push(
    `[reverbed]volume=${clipperInGain},alimiter=limit=0.95:attack=0.5:release=10:level=false,volume=${clipperOutGain}[clipped]`
  );

  // Apply decay (fade out) if enabled
  const decayMs = settings.decayMs || 0;
  if (decayMs > 0) {
    const decaySeconds = decayMs / 1000;
    // Fade out starting from beginning with specified duration
    // The sample will be cut to this length with a fade
    filterParts.push(
      `[clipped]afade=t=out:st=0:d=${decaySeconds}[decayed]`
    );
  } else {
    filterParts.push(`[clipped]acopy[decayed]`);
  }

  // Trim silence from start and end
  // silenceremove for start, then areverse + silenceremove + areverse for end
  const trimThresholdLinear = Math.pow(10, settings.trimDb / 20);
  filterParts.push(
    `[decayed]silenceremove=start_periods=1:start_threshold=${trimThresholdLinear}:detection=peak[trimstart]`
  );
  filterParts.push(
    `[trimstart]areverse,silenceremove=start_periods=1:start_threshold=${trimThresholdLinear}:detection=peak,areverse[trimmed]`
  );

  // Normalize to peak
  // Use loudnorm for one-pass normalization or dynaudnorm
  // For peak normalization, we'll use a two-pass approach simplified to volume filter
  // First, detect peak, then apply gain. For MVP, use dynaudnorm or just limit.
  const peakLinear = Math.pow(10, settings.normalizePeakDb / 20);
  filterParts.push(
    `[trimmed]alimiter=limit=${peakLinear}:level=false,volume=volume=${peakLinear}:precision=fixed[normalized]`
  );

  // Final output
  filterParts.push('[normalized]aformat=sample_fmts=s32:sample_rates=44100:channel_layouts=stereo[out]');

  const filterComplex = filterParts.join(';');

  const ffmpegCmd = [
    'ffmpeg -y',
    ...inputs,
    `-filter_complex "${filterComplex}"`,
    '-map "[out]"',
    '-c:a pcm_s24le', // 24-bit WAV
    `"${outputPath}"`
  ].join(' ');

  console.log('Running FFmpeg command:', ffmpegCmd);

  try {
    const { stderr } = await execAsync(ffmpegCmd, { maxBuffer: 50 * 1024 * 1024 });
    console.log('FFmpeg output:', stderr);
  } catch (error: unknown) {
    const execError = error as { stderr?: string; message?: string };
    console.error('FFmpeg error:', execError.stderr || execError.message);
    throw new Error(`FFmpeg processing failed: ${execError.message}`);
  }

  // Verify output was created
  try {
    await fs.access(outputPath);
  } catch {
    throw new Error('Output file was not created');
  }

  return { outputPath };
}

// Get list of generated files in output directory
export async function getOutputFiles(outputDir: string): Promise<string[]> {
  try {
    await fs.access(outputDir);
    const files = await fs.readdir(outputDir);
    return files
      .filter(f => f.toLowerCase().endsWith('.wav'))
      .map(f => path.join(outputDir, f))
      .sort()
      .reverse(); // Most recent first (assuming incrementing names)
  } catch {
    return [];
  }
}

// Get next increment number for output naming
export async function getNextOutputNumber(outputDir: string, prefix: string): Promise<number> {
  try {
    const files = await fs.readdir(outputDir);
    const pattern = new RegExp(`^${prefix}.*_(\\d{3})\\.wav$`, 'i');
    
    let maxNum = 0;
    for (const file of files) {
      const match = file.match(pattern);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    
    return maxNum + 1;
  } catch {
    return 1;
  }
}

