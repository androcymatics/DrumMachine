import { useState, useRef } from 'react';
import { getAudioPreviewUrl, getAudioDownloadUrl } from '../api';

export interface GeneratedSound {
  id: string;
  path: string;
  name: string;
  category: string;
  createdAt: Date;
}

interface GeneratedProps {
  sounds: GeneratedSound[];
  onClear: () => void;
}

export function Generated({ sounds, onClear }: GeneratedProps) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlay = (sound: GeneratedSound) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }

    if (playingId === sound.id) {
      setPlayingId(null);
      return;
    }

    const audio = new Audio(getAudioPreviewUrl(sound.path));
    audio.onended = () => setPlayingId(null);
    audio.play();
    audioRef.current = audio;
    setPlayingId(sound.id);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-drum-text">Generated Sounds</h2>
          <p className="text-drum-muted">
            {sounds.length === 0 
              ? 'No sounds generated yet. Try Drum Factory or Advanced!'
              : `${sounds.length} sound${sounds.length !== 1 ? 's' : ''} generated this session`
            }
          </p>
        </div>
        
        {sounds.length > 0 && (
          <button
            onClick={onClear}
            className="btn btn-ghost text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            🗑️ Clear All
          </button>
        )}
      </div>

      {/* Empty State */}
      {sounds.length === 0 && (
        <div className="card bg-drum-elevated/50 border-dashed border-2 border-drum-border">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-6xl mb-4">🎵</span>
            <h3 className="text-xl font-semibold text-drum-text mb-2">No sounds yet</h3>
            <p className="text-drum-muted max-w-md">
              Generated sounds will appear here. Head to <strong>Drum Factory</strong> for quick generation 
              or <strong>Advanced</strong> for full control.
            </p>
          </div>
        </div>
      )}

      {/* Sound List */}
      {sounds.length > 0 && (
        <div className="space-y-2">
          {sounds.map((sound, index) => (
            <div
              key={sound.id}
              className={`card bg-drum-elevated hover:bg-drum-surface transition-colors ${
                playingId === sound.id ? 'ring-2 ring-drum-accent' : ''
              }`}
            >
              <div className="flex items-center gap-4">
                {/* Number */}
                <div className="w-10 h-10 rounded-full bg-drum-surface flex items-center justify-center text-drum-muted font-mono text-sm">
                  {sounds.length - index}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-drum-text truncate">
                    {sound.name}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-drum-muted">
                    <span className="px-2 py-0.5 rounded bg-drum-surface text-xs uppercase">
                      {sound.category}
                    </span>
                    <span>•</span>
                    <span>{formatTime(sound.createdAt)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePlay(sound)}
                    className={`btn ${
                      playingId === sound.id
                        ? 'btn-primary'
                        : 'btn-secondary'
                    } py-2 px-4`}
                  >
                    {playingId === sound.id ? '⏹ Stop' : '▶ Play'}
                  </button>
                  <a
                    href={getAudioDownloadUrl(sound.path)}
                    className="btn btn-ghost py-2 px-4 hover:bg-drum-accent/20 hover:text-drum-accent"
                    download
                  >
                    ⬇ Download
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Download All (if multiple) */}
      {sounds.length > 1 && (
        <div className="flex justify-center pt-4">
          <p className="text-sm text-drum-muted">
            💡 Tip: Download individual sounds or use the Advanced tab's output folder to save automatically
          </p>
        </div>
      )}
    </div>
  );
}

