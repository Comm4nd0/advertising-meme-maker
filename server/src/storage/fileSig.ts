/**
 * Magic-byte sniffing for user uploads. Extensions are user-controlled and
 * untrustworthy — these checks ensure a "logo" really is an image and a
 * "music" file really is audio before it lands in the brand library.
 */

export type ImageKind = 'png' | 'jpeg' | 'gif' | 'webp' | 'bmp' | 'svg';
export type AudioKind = 'mp3' | 'wav' | 'ogg' | 'flac' | 'm4a' | 'wma';

function ascii(buf: Buffer, start: number, end: number): string {
  return buf.toString('ascii', start, end);
}

export function sniffImage(buf: Buffer): ImageKind | null {
  if (buf.length >= 8 && buf[0] === 0x89 && ascii(buf, 1, 4) === 'PNG') return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 6 && ascii(buf, 0, 3) === 'GIF') return 'gif';
  if (buf.length >= 12 && ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') return 'webp';
  if (buf.length >= 2 && ascii(buf, 0, 2) === 'BM') return 'bmp';

  // SVG is text. Accept only documents that clearly open an <svg> element and
  // carry no <script>, since logos are served back as static files.
  const head = buf.toString('utf8', 0, Math.min(buf.length, 4096)).replace(/^﻿/, '').trim();
  if (
    (head.startsWith('<?xml') || head.startsWith('<svg') || head.startsWith('<!DOCTYPE svg')) &&
    /<svg[\s>]/i.test(head) &&
    !/<script/i.test(head)
  ) {
    return 'svg';
  }
  return null;
}

export function sniffAudio(buf: Buffer): AudioKind | null {
  if (buf.length < 12) return null;
  if (ascii(buf, 0, 3) === 'ID3') return 'mp3';
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WAVE') return 'wav';
  if (ascii(buf, 0, 4) === 'OggS') return 'ogg'; // also covers opus/vorbis
  if (ascii(buf, 0, 4) === 'fLaC') return 'flac';
  if (ascii(buf, 4, 8) === 'ftyp') return 'm4a'; // MP4 container (m4a/aac)
  // ASF header GUID (wma)
  if (buf[0] === 0x30 && buf[1] === 0x26 && buf[2] === 0xb2 && buf[3] === 0x75) return 'wma';
  // Raw MPEG audio frame sync (mp3 without ID3 tag; also matches ADTS AAC)
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'mp3';
  return null;
}
