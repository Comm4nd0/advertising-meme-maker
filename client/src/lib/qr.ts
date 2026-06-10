import QRCode from 'qrcode';

// QR rasterization is async, but slide rendering is sync — callers await this
// first and pass the canvas into renderSlide. Cached per URL since the same
// code is redrawn on every preview repaint.
const cache = new Map<string, Promise<HTMLCanvasElement>>();

export function qrCanvasFor(text: string): Promise<HTMLCanvasElement> {
  let promise = cache.get(text);
  if (!promise) {
    promise = new Promise<HTMLCanvasElement>((resolve, reject) => {
      const canvas = document.createElement('canvas');
      QRCode.toCanvas(
        canvas,
        text,
        {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 512,
          color: { dark: '#000000ff', light: '#ffffffff' },
        },
        (err) => (err ? reject(err) : resolve(canvas)),
      );
    });
    promise.catch(() => cache.delete(text));
    cache.set(text, promise);
  }
  return promise;
}
