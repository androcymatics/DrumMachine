// Completion sound utility - plays a pleasant "ding" when generation is done

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

export function playCompletionSound(): void {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Create a pleasant two-tone "ding" sound
    const oscillator1 = ctx.createOscillator();
    const oscillator2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    // First tone - higher pitch
    oscillator1.type = 'sine';
    oscillator1.frequency.setValueAtTime(880, now); // A5
    oscillator1.frequency.setValueAtTime(1174.66, now + 0.1); // D6

    // Second tone - creates harmony
    oscillator2.type = 'sine';
    oscillator2.frequency.setValueAtTime(1318.51, now); // E6
    oscillator2.frequency.setValueAtTime(1760, now + 0.1); // A6

    // Envelope - quick attack, gentle decay
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.3, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

    // Connect the nodes
    oscillator1.connect(gainNode);
    oscillator2.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Play the sound
    oscillator1.start(now);
    oscillator2.start(now);
    oscillator1.stop(now + 0.5);
    oscillator2.stop(now + 0.5);
  } catch (error) {
    // Silently fail if audio context is not available
    console.warn('Could not play completion sound:', error);
  }
}

