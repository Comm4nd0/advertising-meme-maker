export const TARGET_FPS = 30;
export const TARGET_SAMPLE_RATE = 48000;

export function evenDim(n: number): number {
  return n % 2 === 0 ? n : n - 1;
}
