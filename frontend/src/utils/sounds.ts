// Completion sound utility - plays a ding when generation is done

let completionAudio: HTMLAudioElement | null = null;

export function playCompletionSound(): void {
  try {
    // Stop any currently playing completion sound
    if (completionAudio) {
      completionAudio.pause();
      completionAudio.currentTime = 0;
    }

    // Play the custom ding sound
    completionAudio = new Audio('/completion-ding.wav');
    completionAudio.volume = 0.5; // 50% volume so it's not too loud
    completionAudio.play().catch(err => {
      console.warn('Could not play completion sound:', err);
    });
  } catch (error) {
    // Silently fail if audio is not available
    console.warn('Could not play completion sound:', error);
  }
}
