// Gated verbose logging. Set DEBUG=1 (or any non-empty value) in the server
// environment to surface the export/ffmpeg diagnostics; off by default so a
// normal encode doesn't flood stderr with the full filter_complex.
export function debugLog(...args: unknown[]): void {
  if (process.env.DEBUG) console.log(...args);
}
