import type { Sample, SampleCategory, GenerateLayerSettings, OutputFile } from './types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3001';

async function fetchAPI<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Library API
export async function addFolder(path: string): Promise<{ added: number; total: number }> {
  return fetchAPI('/library/add-folder', {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

export async function getFolders(): Promise<string[]> {
  const result = await fetchAPI<{ folders: string[] }>('/library/folders');
  return result.folders;
}

export async function removeFolder(path: string): Promise<void> {
  await fetchAPI(`/library/folder?path=${encodeURIComponent(path)}`, {
    method: 'DELETE',
  });
}

export async function searchSamples(
  query?: string,
  category?: SampleCategory
): Promise<Sample[]> {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (category) params.set('category', category);

  const result = await fetchAPI<{ samples: Sample[] }>(
    `/library/search?${params.toString()}`
  );
  return result.samples;
}

export async function getLibraryStats(): Promise<{
  totalSamples: number;
  folders: number;
  byCategory: Record<string, number>;
}> {
  return fetchAPI('/library/stats');
}

// Audio API
export function getAudioPreviewUrl(path: string): string {
  return `${API_BASE}/audio/preview?path=${encodeURIComponent(path)}`;
}

export function getAudioDownloadUrl(path: string): string {
  return `${API_BASE}/audio/download?path=${encodeURIComponent(path)}`;
}

// Generator API
export async function generateLayer(params: {
  bodyPath: string;
  transientPath: string;
  texturePath?: string;
  settings: GenerateLayerSettings;
  outputDir: string;
  fileName: string;
}): Promise<{ outputPath: string }> {
  return fetchAPI('/generate/layer', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function getNextOutputNumber(
  outputDir: string,
  prefix: string
): Promise<number> {
  const result = await fetchAPI<{ nextNumber: number }>(
    `/generate/next-number?outputDir=${encodeURIComponent(outputDir)}&prefix=${encodeURIComponent(prefix)}`
  );
  return result.nextNumber;
}

// Output API
export async function getOutputFiles(outputDir: string): Promise<OutputFile[]> {
  const result = await fetchAPI<{ files: OutputFile[] }>(
    `/output/list?outputDir=${encodeURIComponent(outputDir)}`
  );
  return result.files;
}

export async function deleteOutputFile(path: string): Promise<void> {
  await fetchAPI(`/output/file?path=${encodeURIComponent(path)}`, {
    method: 'DELETE',
  });
}

// Health check
export async function healthCheck(): Promise<boolean> {
  try {
    await fetchAPI('/health');
    return true;
  } catch {
    return false;
  }
}

