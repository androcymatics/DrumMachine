import { useState, useEffect, useRef } from 'react';
import { getOutputFiles, deleteOutputFile, getAudioPreviewUrl, getAudioDownloadUrl } from '../api';
import type { OutputFile } from '../types';

interface OutputProps {
  outputDir: string;
  setOutputDir: (dir: string) => void;
}

export function Output({ outputDir, setOutputDir }: OutputProps) {
  const [files, setFiles] = useState<OutputFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playingFile, setPlayingFile] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (outputDir.trim()) {
      loadFiles();
    }
  }, [outputDir]);

  const loadFiles = async () => {
    if (!outputDir.trim()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const outputFiles = await getOutputFiles(outputDir);
      setFiles(outputFiles);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load output files');
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = (file: OutputFile) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }

    if (playingFile === file.path) {
      setPlayingFile(null);
      return;
    }

    const audio = new Audio(getAudioPreviewUrl(file.path));
    audio.onended = () => setPlayingFile(null);
    audio.onerror = () => {
      setPlayingFile(null);
      setError('Failed to play audio');
    };
    audio.play();
    audioRef.current = audio;
    setPlayingFile(file.path);
  };

  const handleDelete = async (file: OutputFile) => {
    if (!confirm(`Delete "${file.name}"? This cannot be undone.`)) return;

    try {
      await deleteOutputFile(file.path);
      setFiles(files.filter(f => f.path !== file.path));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete file');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Output Directory Setting */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>📁</span> Output Directory
        </h3>
        
        <div className="flex gap-3">
          <input
            type="text"
            value={outputDir}
            onChange={(e) => setOutputDir(e.target.value)}
            placeholder="/Users/andro/Samples/Generated"
            className="input flex-1 font-mono text-sm"
          />
          <button
            onClick={loadFiles}
            disabled={!outputDir.trim() || loading}
            className="btn btn-secondary"
          >
            {loading ? '⏳' : '🔄'} Refresh
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-4 underline">Dismiss</button>
        </div>
      )}

      {/* No Output Dir */}
      {!outputDir.trim() && (
        <div className="card text-center py-12">
          <div className="text-6xl mb-4">📂</div>
          <h4 className="text-xl font-semibold text-drum-text mb-2">Set Output Directory</h4>
          <p className="text-drum-muted">
            Enter a folder path above to view your generated one-shots
          </p>
        </div>
      )}

      {/* Files List */}
      {outputDir.trim() && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 bg-drum-elevated border-b border-drum-border flex items-center justify-between">
            <h4 className="font-semibold text-drum-text">Generated Files</h4>
            <span className="text-sm text-drum-muted">{files.length} files</span>
          </div>
          
          {loading ? (
            <div className="px-4 py-12 text-center text-drum-muted">
              <div className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span> Loading files...
              </div>
            </div>
          ) : files.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <div className="text-4xl mb-4">🎵</div>
              <p className="text-drum-muted">
                No generated files yet. Head to the Advanced tab to create some!
              </p>
            </div>
          ) : (
            <div className="divide-y divide-drum-border/50">
              {files.map((file) => (
                <div
                  key={file.path}
                  className="px-4 py-3 flex items-center gap-4 hover:bg-drum-elevated transition-colors"
                >
                  {/* Play Button */}
                  <button
                    onClick={() => handlePlay(file)}
                    className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                      playingFile === file.path
                        ? 'bg-drum-accent text-white animate-pulse'
                        : 'bg-drum-elevated hover:bg-drum-accent/20'
                    }`}
                  >
                    {playingFile === file.path ? '⏹' : '▶'}
                  </button>
                  
                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-drum-text truncate">{file.name}</div>
                    <div className="flex items-center gap-4 text-xs text-drum-muted">
                      <span>{formatFileSize(file.size)}</span>
                      <span>{formatDate(file.createdAt)}</span>
                    </div>
                  </div>
                  
                  {/* Waveform Placeholder */}
                  <div className="hidden md:flex items-center gap-0.5 h-8 opacity-50">
                    {Array.from({ length: 30 }).map((_, i) => (
                      <div
                        key={i}
                        className="w-1 bg-drum-accent rounded-full"
                        style={{
                          height: `${Math.random() * 24 + 8}px`,
                        }}
                      />
                    ))}
                  </div>
                  
                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <a
                      href={getAudioDownloadUrl(file.path)}
                      className="btn btn-ghost text-drum-accent hover:bg-drum-accent/10"
                      download
                      title="Download"
                    >
                      ⬇️
                    </a>
                    <button
                      onClick={() => handleDelete(file)}
                      className="btn btn-ghost text-red-400 hover:bg-red-500/10"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      {files.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card text-center">
            <div className="text-3xl font-bold text-drum-accent">{files.length}</div>
            <div className="text-sm text-drum-muted">Total Files</div>
          </div>
          <div className="card text-center">
            <div className="text-3xl font-bold text-drum-secondary">
              {formatFileSize(files.reduce((acc, f) => acc + f.size, 0))}
            </div>
            <div className="text-sm text-drum-muted">Total Size</div>
          </div>
          <div className="card text-center">
            <div className="text-3xl font-bold text-drum-text">
              {files.length > 0 
                ? formatDate(files[0].createdAt).split(',')[0]
                : '-'
              }
            </div>
            <div className="text-sm text-drum-muted">Last Generated</div>
          </div>
        </div>
      )}
    </div>
  );
}

