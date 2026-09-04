/**
 * Blurhash -> `blurDataURL`, for `next/image`'s `placeholder="blur"` (A1.1).
 *
 * The API stores a blurhash on every product image (`product_images.blurhash`,
 * derived at upload time). `next/image` cannot use that directly - it wants a
 * data URL it can drop straight into a `background-image` - so this decodes the
 * hash and encodes the result as a tiny PNG.
 *
 * Why the whole thing is written out by hand rather than pulled from `blurhash`
 * plus a canvas:
 *
 *  - It has to run on the server. The listing and detail pages render their
 *    first paint on the server, which is the paint the placeholder exists for;
 *    a canvas-based decoder only works after hydration, by which point the real
 *    image is usually already on screen.
 *  - It has to be small. This ships to the browser as well - search results and
 *    the cart render client-side - and a decoder plus an encoder that together
 *    come to ~3KB is a better trade than 20KB of dependencies for an effect
 *    that lasts 200ms.
 *
 * The output is an 8x8 PNG, about 350 characters of base64. Next blurs it with
 * a 20px Gaussian and scales it to fill, so anything sharper is detail that is
 * thrown away before it reaches a screen.
 */

/** Blurhash's base83 alphabet, in value order. */
const BASE83 =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';

const VALUE_OF = new Map<string, number>(
  [...BASE83].map((character, index) => [character, index]),
);

/** Decoded placeholders are reused: the same product image renders many times. */
const cache = new Map<string, string | undefined>();

/** A listing page touches a few dozen images; this is headroom, not a budget. */
const CACHE_LIMIT = 512;

/**
 * A `data:` PNG for the given blurhash, or `undefined` when there is nothing to
 * decode.
 *
 * `undefined` is the important half of the contract: images recorded before the
 * blurhash column was populated have none, and a caller spreading the result
 * gets `placeholder="empty"` rather than a crash or a grey box.
 */
export function blurDataUrl(hash: string | null | undefined): string | undefined {
  if (!hash || hash.length < 6) return undefined;

  if (cache.has(hash)) return cache.get(hash);

  let result: string | undefined;
  try {
    result = encodePng(decodeBlurhash(hash, 8, 8), 8, 8);
  } catch {
    // A malformed hash is bad data, not a rendering failure - fall back to no
    // placeholder and let the image fade in over the muted background.
    result = undefined;
  }

  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(hash, result);
  return result;
}

/**
 * Spread onto a `next/image` to give it a placeholder when one is available.
 *
 * ```tsx
 * <Image src={image.url} alt="" fill {...blurProps(image.blurhash)} />
 * ```
 */
export function blurProps(
  hash: string | null | undefined,
): { placeholder: 'blur'; blurDataURL: string } | Record<string, never> {
  const url = blurDataUrl(hash);
  return url ? { placeholder: 'blur', blurDataURL: url } : {};
}

/* -------------------------------------------------------------------------- */
/*  Blurhash                                                                  */
/* -------------------------------------------------------------------------- */

function decode83(value: string): number {
  let result = 0;
  for (const character of value) {
    const digit = VALUE_OF.get(character);
    if (digit === undefined) throw new Error(`Invalid blurhash character: ${character}`);
    result = result * 83 + digit;
  }
  return result;
}

/** sRGB byte -> linear float. */
function toLinear(value: number): number {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** Linear float -> sRGB byte, clamped. */
function toSrgb(value: number): number {
  const v = Math.max(0, Math.min(1, value));
  const encoded = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(encoded * 255 + 0.5);
}

function signPow(value: number, exponent: number): number {
  return Math.sign(value) * Math.abs(value) ** exponent;
}

/** Decodes to a flat RGB byte array, row-major, no alpha. */
function decodeBlurhash(hash: string, width: number, height: number): Uint8Array {
  const sizeFlag = decode83(hash[0]);
  const componentsX = (sizeFlag % 9) + 1;
  const componentsY = Math.floor(sizeFlag / 9) + 1;

  if (hash.length !== 4 + 2 * componentsX * componentsY) {
    throw new Error('Blurhash length does not match its component count');
  }

  const maximum = (decode83(hash[1]) + 1) / 166;

  const colours: Array<[number, number, number]> = [];

  for (let index = 0; index < componentsX * componentsY; index += 1) {
    if (index === 0) {
      const dc = decode83(hash.slice(2, 6));
      colours.push([toLinear(dc >> 16), toLinear((dc >> 8) & 255), toLinear(dc & 255)]);
      continue;
    }

    const ac = decode83(hash.slice(4 + index * 2, 6 + index * 2));
    colours.push([
      signPow((Math.floor(ac / (19 * 19)) - 9) / 9, 2) * maximum,
      signPow(((Math.floor(ac / 19) % 19) - 9) / 9, 2) * maximum,
      signPow(((ac % 19) - 9) / 9, 2) * maximum,
    ]);
  }

  const pixels = new Uint8Array(width * height * 3);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;

      for (let j = 0; j < componentsY; j += 1) {
        for (let i = 0; i < componentsX; i += 1) {
          // The basis is a 2D cosine sampled at the pixel centre; sampling at
          // the corner instead is what makes a decoded hash look shifted.
          const basis =
            Math.cos((Math.PI * (x + 0.5) * i) / width) *
            Math.cos((Math.PI * (y + 0.5) * j) / height);
          const colour = colours[i + j * componentsX];
          r += colour[0] * basis;
          g += colour[1] * basis;
          b += colour[2] * basis;
        }
      }

      const offset = (y * width + x) * 3;
      pixels[offset] = toSrgb(r);
      pixels[offset + 1] = toSrgb(g);
      pixels[offset + 2] = toSrgb(b);
    }
  }

  return pixels;
}

/* -------------------------------------------------------------------------- */
/*  PNG                                                                       */
/* -------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function be32(value: number): number[] {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function chunk(type: string, data: number[]): number[] {
  const typed = [...type].map((character) => character.charCodeAt(0));
  const body = Uint8Array.from([...typed, ...data]);
  return [...be32(data.length), ...body, ...be32(crc32(body))];
}

/**
 * Encodes RGB bytes as a PNG.
 *
 * The zlib stream uses a stored (uncompressed) deflate block. Compressing 200
 * bytes of already-smooth gradient would save a few dozen bytes and cost a
 * DEFLATE implementation, which is not a trade worth making at this size - and
 * a stored block is still a valid zlib stream that every decoder accepts.
 */
function encodePng(pixels: Uint8Array, width: number, height: number): string {
  // PNG scanlines are prefixed with a filter byte; 0 means "no filtering".
  const stride = 1 + width * 3;
  const raw = new Uint8Array(height * stride);

  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0;
    raw.set(pixels.subarray(y * width * 3, (y + 1) * width * 3), y * stride + 1);
  }

  const length = raw.length;
  const zlib = [
    0x78, // CMF: deflate, 32K window
    0x01, // FLG: no preset dictionary, fastest compression level
    0x01, // final stored block
    length & 255,
    (length >>> 8) & 255,
    ~length & 255,
    (~length >>> 8) & 255,
    ...raw,
    ...be32(adler32(raw)),
  ];

  const bytes = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk('IHDR', [
      ...be32(width),
      ...be32(height),
      8, // bit depth
      2, // colour type: truecolour, no alpha
      0, // deflate
      0, // adaptive filtering
      0, // no interlace
    ]),
    ...chunk('IDAT', zlib),
    ...chunk('IEND', []),
  ]);

  return `data:image/png;base64,${toBase64(bytes)}`;
}

/** `btoa` exists in every runtime this ships to - browsers and Node >= 16. */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
