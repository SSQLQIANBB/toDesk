let audioContext: AudioContext | null = null;
export function getSpeakingContext() {
  if (!audioContext || audioContext.state === 'closed') audioContext = new AudioContext();
  return audioContext;
}

export function isVoiceActive(samples: Uint8Array, threshold = 0.025) {
  if (!samples.length) return false;
  const energy = samples.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0);
  return Math.sqrt(energy / samples.length) >= threshold;
}
