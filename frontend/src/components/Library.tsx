import { useState, useEffect, useRef } from 'react';
import { searchSamples, addFolder, getFolders, removeFolder, getAudioPreviewUrl, getLibraryStats } from '../api';
import type { Sample, SampleCategory } from '../types';
import { CATEGORIES, CATEGORY_COLORS } from '../types';

interface LibraryProps {
  onSelectForGenerator: (sample: Sample, slot: 'body' | 'transient' | 'texture') => void;
  selectedBody: Sample | null;
  selectedTransient: Sample | null;
  selectedTexture: Sample | null;
}

export function Library({ onSelectForGenerator, selectedBody, selectedTransient, selectedTexture }: LibraryProps) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<SampleCategory | 'all'>('all');
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [newFolderPath, setNewFolderPath] = useState('');
  const [stats, setStats] = useState<{ totalSamples: number; byCategory: Record<string, number> } | null>(null);
  const [playingSample, setPlayingSample] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      loadSamples();
    }, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, categoryFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [samplesData, foldersData, statsData] = await Promise.all([
        searchSamples(),
        getFolders(),
        getLibraryStats()
      ]);
      setSamples(samplesData);
      setFolders(foldersData);
      setStats(statsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load library');
    } finally {
      setLoading(false);
    }
  };

  const loadSamples = async () => {
    try {
      const samplesData = await searchSamples(
        searchQuery || undefined,
        categoryFilter === 'all' ? undefined : categoryFilter
      );
      setSamples(samplesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search samples');
    }
  };

  const handleAddFolder = async () => {
    if (!newFolderPath.trim()) return;
    
    setScanning(true);
    setError(null);
    try {
      const result = await addFolder(newFolderPath.trim());
      setNewFolderPath('');
      await loadData();
      alert(`Added ${result.added} samples. Total: ${result.total}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add folder');
    } finally {
      setScanning(false);
    }
  };

  const handleRemoveFolder = async (path: string) => {
    if (!confirm(`Remove folder "${path}" from library?`)) return;
    
    try {
      await removeFolder(path);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove folder');
    }
  };

  const handlePlay = async (sample: Sample) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (playingSample === sample.id) {
      setPlayingSample(null);
      return;
    }

    const url = getAudioPreviewUrl(sample.path);
    console.log('Playing audio from:', url);
    
    const audio = new Audio(url);
    audio.onended = () => setPlayingSample(null);
    audio.onerror = (e) => {
      console.error('Audio error:', e, audio.error);
      setPlayingSample(null);
      setError(`Failed to play audio: ${audio.error?.message || 'Unknown error'}`);
    };
    
    try {
      await audio.play();
      audioRef.current = audio;
      setPlayingSample(sample.id);
    } catch (err) {
      console.error('Play failed:', err);
      setError(`Failed to play: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setPlayingSample(null);
    }
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
    return `${seconds.toFixed(2)}s`;
  };

  const isSelected = (sample: Sample) => {
    return sample.id === selectedBody?.id || 
           sample.id === selectedTransient?.id || 
           sample.id === selectedTexture?.id;
  };

  return (
    <div className="space-y-6">
      {/* Stats Bar */}
      {stats && (
        <div className="flex gap-4 overflow-x-auto pb-2">
          <div className="card flex-shrink-0">
            <div className="text-2xl font-bold text-drum-accent">{stats.totalSamples}</div>
            <div className="text-xs text-drum-muted">Total Samples</div>
          </div>
          {CATEGORIES.map(cat => (
            <div key={cat} className="card flex-shrink-0">
              <div className="text-2xl font-bold text-drum-text">{stats.byCategory[cat] || 0}</div>
              <div className={`text-xs capitalize px-2 py-0.5 rounded border ${CATEGORY_COLORS[cat]}`}>
                {cat}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Folder Section */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>📂</span> Add Sample Folder
        </h3>
        <div className="flex gap-3">
          <input
            type="text"
            value={newFolderPath}
            onChange={(e) => setNewFolderPath(e.target.value)}
            placeholder="Paste folder path (e.g., /Users/andro/Samples/Kicks)"
            className="input flex-1 font-mono text-sm"
            onKeyDown={(e) => e.key === 'Enter' && handleAddFolder()}
          />
          <button
            onClick={handleAddFolder}
            disabled={scanning || !newFolderPath.trim()}
            className="btn btn-primary whitespace-nowrap"
          >
            {scanning ? (
              <>
                <span className="animate-spin">⏳</span> Scanning...
              </>
            ) : (
              <>
                <span>➕</span> Add Folder
              </>
            )}
          </button>
        </div>

        {/* Existing folders */}
        {folders.length > 0 && (
          <div className="mt-4">
            <div className="text-sm text-drum-muted mb-2">Indexed Folders:</div>
            <div className="flex flex-wrap gap-2">
              {folders.map((folder) => (
                <div
                  key={folder}
                  className="flex items-center gap-2 bg-drum-elevated px-3 py-2 rounded-lg text-sm font-mono"
                >
                  <span className="text-drum-muted truncate max-w-xs">{folder}</span>
                  <button
                    onClick={() => handleRemoveFolder(folder)}
                    className="text-drum-muted hover:text-red-400 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
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

      {/* Search and Filter */}
      <div className="flex gap-4 flex-wrap">
        <div className="flex-1 min-w-64">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search samples..."
              className="input pl-10"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-drum-muted">🔍</span>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`btn ${categoryFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          >
            All
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`btn capitalize ${categoryFilter === cat ? 'btn-primary' : 'btn-secondary'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Sample List */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-drum-elevated border-b border-drum-border">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-drum-muted w-12"></th>
                <th className="text-left px-4 py-3 text-sm font-medium text-drum-muted">Name</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-drum-muted w-24">Category</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-drum-muted w-20">Duration</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-drum-muted w-20">Peak dB</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-drum-muted w-48">Add to Generator</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-drum-muted">
                    <div className="flex items-center justify-center gap-2">
                      <span className="animate-spin">⏳</span> Loading samples...
                    </div>
                  </td>
                </tr>
              ) : samples.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-drum-muted">
                    No samples found. Add a folder to get started.
                  </td>
                </tr>
              ) : (
                samples.map((sample) => (
                  <tr
                    key={sample.id}
                    className={`sample-row border-b border-drum-border/50 ${
                      isSelected(sample) ? 'bg-drum-accent/10' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handlePlay(sample)}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                          playingSample === sample.id
                            ? 'bg-drum-accent text-white animate-pulse'
                            : 'bg-drum-elevated hover:bg-drum-accent/20'
                        }`}
                      >
                        {playingSample === sample.id ? '⏹' : '▶'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-drum-text">{sample.name}</div>
                      <div className="text-xs text-drum-muted truncate max-w-md" title={sample.path}>
                        {sample.path}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs border capitalize ${CATEGORY_COLORS[sample.category]}`}>
                        {sample.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-drum-muted font-mono">
                      {formatDuration(sample.duration)}
                    </td>
                    <td className="px-4 py-3 text-sm text-drum-muted font-mono">
                      {sample.peakDb.toFixed(1)} dB
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => onSelectForGenerator(sample, 'body')}
                          className={`btn btn-ghost text-xs ${
                            selectedBody?.id === sample.id ? 'bg-drum-accent/20 text-drum-accent' : ''
                          }`}
                          title="Use as Body layer"
                        >
                          Body
                        </button>
                        <button
                          onClick={() => onSelectForGenerator(sample, 'transient')}
                          className={`btn btn-ghost text-xs ${
                            selectedTransient?.id === sample.id ? 'bg-drum-accent/20 text-drum-accent' : ''
                          }`}
                          title="Use as Transient layer"
                        >
                          Trans
                        </button>
                        <button
                          onClick={() => onSelectForGenerator(sample, 'texture')}
                          className={`btn btn-ghost text-xs ${
                            selectedTexture?.id === sample.id ? 'bg-drum-accent/20 text-drum-accent' : ''
                          }`}
                          title="Use as Texture layer"
                        >
                          Texture
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {samples.length > 0 && (
          <div className="px-4 py-3 bg-drum-elevated border-t border-drum-border text-sm text-drum-muted">
            Showing {samples.length} samples
          </div>
        )}
      </div>
    </div>
  );
}

