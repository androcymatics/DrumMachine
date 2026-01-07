import Fastify from 'fastify';
import cors from '@fastify/cors';
import { promises as fs } from 'fs';
import path from 'path';
import { createReadStream, statSync } from 'fs';
import {
  addFolder,
  searchSamples,
  getFolders,
  removeFolder,
  loadLibrary
} from './library.js';
import {
  generateLayeredSample,
  getOutputFiles,
  getNextOutputNumber
} from './generator.js';
import type { SampleCategory, GenerateLayerSettings } from './types.js';

const fastify = Fastify({
  logger: true
});

// Enable CORS for all origins (needed for deployed frontend)
await fastify.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS']
});

// Root route (for health checks)
fastify.get('/', async () => {
  return { status: 'ok', service: 'Drum Machine API' };
});

// Health check
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// ============ LIBRARY ENDPOINTS ============

// Add folder to library
fastify.post<{
  Body: { path: string }
}>('/library/add-folder', async (request, reply) => {
  const { path: folderPath } = request.body;
  
  if (!folderPath) {
    return reply.status(400).send({ error: 'Path is required' });
  }
  
  try {
    const result = await addFolder(folderPath);
    return { success: true, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return reply.status(400).send({ error: message });
  }
});

// Get all folders
fastify.get('/library/folders', async () => {
  const folders = await getFolders();
  return { folders };
});

// Remove folder
fastify.delete<{
  Querystring: { path: string }
}>('/library/folder', async (request, reply) => {
  const { path: folderPath } = request.query;
  
  if (!folderPath) {
    return reply.status(400).send({ error: 'Path is required' });
  }
  
  await removeFolder(folderPath);
  return { success: true };
});

// Search samples
fastify.get<{
  Querystring: { q?: string; category?: SampleCategory }
}>('/library/search', async (request) => {
  const { q, category } = request.query;
  const samples = await searchSamples(q, category);
  return { samples, total: samples.length };
});

// Get library stats
fastify.get('/library/stats', async () => {
  const library = await loadLibrary();
  const stats = {
    totalSamples: library.samples.length,
    folders: library.folders.length,
    byCategory: {} as Record<string, number>,
    lastUpdated: library.lastUpdated
  };
  
  for (const sample of library.samples) {
    stats.byCategory[sample.category] = (stats.byCategory[sample.category] || 0) + 1;
  }
  
  return stats;
});

// ============ AUDIO PREVIEW ENDPOINT ============

// Stream audio file for preview
fastify.get<{
  Querystring: { path: string }
}>('/audio/preview', async (request, reply) => {
  const { path: filePath } = request.query;
  
  console.log('Audio preview request for:', filePath);
  
  if (!filePath) {
    return reply.status(400).send({ error: 'Path is required' });
  }
  
  // Decode the path in case it's double-encoded
  const decodedPath = decodeURIComponent(filePath);
  console.log('Decoded path:', decodedPath);
  
  try {
    // Verify file exists and is accessible
    await fs.access(decodedPath);
    const stats = statSync(decodedPath);
    console.log('File found, size:', stats.size);
    
    // Determine content type based on extension
    const ext = path.extname(decodedPath).toLowerCase();
    let contentType = 'audio/wav';
    if (ext === '.aiff' || ext === '.aif') {
      contentType = 'audio/aiff';
    } else if (ext === '.mp3') {
      contentType = 'audio/mpeg';
    }
    
    // Support range requests for better streaming
    const range = request.headers.range;
    
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunkSize = end - start + 1;
      
      console.log('Range request:', start, '-', end);
      
      reply.status(206);
      reply.header('Content-Range', `bytes ${start}-${end}/${stats.size}`);
      reply.header('Accept-Ranges', 'bytes');
      reply.header('Content-Length', chunkSize);
      reply.header('Content-Type', contentType);
      
      const stream = createReadStream(decodedPath, { start, end });
      return reply.send(stream);
    }
    
    console.log('Sending full file, content-type:', contentType);
    
    reply.header('Content-Type', contentType);
    reply.header('Content-Length', stats.size);
    reply.header('Accept-Ranges', 'bytes');
    reply.header('Cache-Control', 'no-cache');
    
    const stream = createReadStream(decodedPath);
    return reply.send(stream);
  } catch (error) {
    console.error('Audio preview error:', error);
    const message = error instanceof Error ? error.message : 'File not found';
    return reply.status(404).send({ error: message });
  }
});

// ============ GENERATOR ENDPOINTS ============

// Generate layered sample
fastify.post<{
  Body: {
    bodyPath?: string;
    transientPath?: string;
    texturePath?: string;
    settings: GenerateLayerSettings;
    outputDir?: string;
    fileName?: string;
    category?: string;
  }
}>('/generate/layer', async (request, reply) => {
  const { bodyPath, transientPath, texturePath, settings, outputDir, fileName, category } = request.body;
  
  // Validate - need at least one of body or transient
  if (!bodyPath && !transientPath) {
    return reply.status(400).send({
      error: 'At least one of bodyPath or transientPath must be provided'
    });
  }
  
  // Validate settings
  const defaultSettings: GenerateLayerSettings = {
    bodySemitones: 0,
    transientGainDb: 0,
    textureHpHz: 200,
    saturation: 0,
    reverbMix: 0,
    clipperInGainDb: 0,
    clipperOutGainDb: 0,
    trimDb: -60,
    decayMs: 0,
    normalizePeakDb: -0.8
  };
  
  const mergedSettings = { ...defaultSettings, ...settings };
  
  try {
    const result = await generateLayeredSample({
      bodyPath,
      transientPath,
      texturePath,
      settings: mergedSettings,
      outputDir,
      fileName,
      category
    });
    
    return { success: true, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Generation failed';
    fastify.log.error(error);
    return reply.status(500).send({ error: message });
  }
});

// Get next output number
fastify.get<{
  Querystring: { outputDir: string; prefix: string }
}>('/generate/next-number', async (request, reply) => {
  const { outputDir, prefix } = request.query;
  
  if (!outputDir || !prefix) {
    return reply.status(400).send({ error: 'outputDir and prefix are required' });
  }
  
  const nextNumber = await getNextOutputNumber(outputDir, prefix);
  return { nextNumber };
});

// ============ OUTPUT MANAGEMENT ENDPOINTS ============

// List output files
fastify.get<{
  Querystring: { outputDir: string }
}>('/output/list', async (request, reply) => {
  const { outputDir } = request.query;
  
  if (!outputDir) {
    return reply.status(400).send({ error: 'outputDir is required' });
  }
  
  try {
    const files = await getOutputFiles(outputDir);
    const fileInfos = await Promise.all(
      files.map(async (filePath) => {
        try {
          const stats = statSync(filePath);
          return {
            path: filePath,
            name: path.basename(filePath),
            size: stats.size,
            createdAt: stats.birthtime.toISOString()
          };
        } catch {
          return null;
        }
      })
    );
    
    return { files: fileInfos.filter(Boolean) };
  } catch {
    return { files: [] };
  }
});

// Delete output file
fastify.delete<{
  Querystring: { path: string }
}>('/output/file', async (request, reply) => {
  const { path: filePath } = request.query;
  
  if (!filePath) {
    return reply.status(400).send({ error: 'Path is required' });
  }
  
  try {
    await fs.unlink(filePath);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete file';
    return reply.status(400).send({ error: message });
  }
});

// Download file
fastify.get<{
  Querystring: { path: string }
}>('/audio/download', async (request, reply) => {
  const { path: filePath } = request.query;
  
  if (!filePath) {
    return reply.status(400).send({ error: 'Path is required' });
  }
  
  const decodedPath = decodeURIComponent(filePath);
  
  try {
    await fs.access(decodedPath);
    const stats = statSync(decodedPath);
    const fileName = path.basename(decodedPath);
    
    reply.header('Content-Type', 'audio/wav');
    reply.header('Content-Length', stats.size);
    reply.header('Content-Disposition', `attachment; filename="${fileName}"`);
    
    const stream = createReadStream(decodedPath);
    return reply.send(stream);
  } catch (error) {
    console.error('Download error:', error);
    const message = error instanceof Error ? error.message : 'File not found';
    return reply.status(404).send({ error: message });
  }
});

// ============ START SERVER ============

const PORT = parseInt(process.env.PORT || '3001', 10);

// Auto-load default samples on startup
async function loadDefaultSamples() {
  const library = await loadLibrary();
  if (library.samples.length === 0) {
    // Check if we have bundled samples
    const defaultSamplesPath = path.join(process.cwd(), 'samples');
    try {
      await fs.access(defaultSamplesPath);
      console.log('📦 Loading default sample library...');
      const result = await addFolder(defaultSamplesPath);
      console.log(`✅ Loaded ${result.added} default samples`);
    } catch {
      console.log('ℹ️ No default samples folder found');
    }
  } else {
    console.log(`📚 Library already has ${library.samples.length} samples`);
  }
}

try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`\n🥁 Drum One-Shot Generator Backend running at http://localhost:${PORT}\n`);
  
  // Load default samples after server starts
  await loadDefaultSamples();
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

