import { describe, it, expect } from 'vitest';
import { sniffImage, sniffAudio } from './fileSig';

function buf(...bytes: (number | string)[]): Buffer {
  const parts = bytes.map((b) =>
    typeof b === 'string' ? Buffer.from(b, 'ascii') : Buffer.from([b]),
  );
  // Pad so length checks (>= 12 bytes) pass for short signatures.
  return Buffer.concat([...parts, Buffer.alloc(16)]);
}

describe('sniffImage', () => {
  it('detects png', () => {
    expect(sniffImage(buf(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a))).toBe('png');
  });

  it('detects jpeg', () => {
    expect(sniffImage(buf(0xff, 0xd8, 0xff, 0xe0))).toBe('jpeg');
  });

  it('detects gif', () => {
    expect(sniffImage(buf('GIF89a'))).toBe('gif');
  });

  it('detects webp', () => {
    expect(sniffImage(buf('RIFF', 0x00, 0x00, 0x00, 0x00, 'WEBP'))).toBe('webp');
  });

  it('detects svg and rejects svg containing scripts', () => {
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe('svg');
    expect(sniffImage(Buffer.from('<?xml version="1.0"?><svg></svg>'))).toBe('svg');
    expect(
      sniffImage(Buffer.from('<svg><script>alert(1)</script></svg>')),
    ).toBeNull();
  });

  it('rejects audio and video masquerading as images', () => {
    expect(sniffImage(buf('ID3', 0x04))).toBeNull();
    expect(sniffImage(buf(0x00, 0x00, 0x00, 0x18, 'ftypmp42'))).toBeNull();
    expect(sniffImage(Buffer.from('<html><body>hi</body></html>'))).toBeNull();
  });
});

describe('sniffAudio', () => {
  it('detects mp3 via ID3 tag and raw frame sync', () => {
    expect(sniffAudio(buf('ID3', 0x04, 0x00))).toBe('mp3');
    expect(sniffAudio(buf(0xff, 0xfb, 0x90))).toBe('mp3');
  });

  it('detects wav', () => {
    expect(sniffAudio(buf('RIFF', 0x00, 0x00, 0x00, 0x00, 'WAVE'))).toBe('wav');
  });

  it('detects ogg, flac and m4a', () => {
    expect(sniffAudio(buf('OggS'))).toBe('ogg');
    expect(sniffAudio(buf('fLaC'))).toBe('flac');
    expect(sniffAudio(buf(0x00, 0x00, 0x00, 0x18, 'ftypM4A '))).toBe('m4a');
  });

  it('rejects images and random data masquerading as audio', () => {
    expect(sniffAudio(buf(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a))).toBeNull();
    expect(sniffAudio(Buffer.from('just some text file content here'))).toBeNull();
  });
});
