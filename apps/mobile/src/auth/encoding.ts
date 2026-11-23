/** Dependency-free base64url / UTF-8 helpers usable in Hermes, Node and browsers. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function base64UrlEncode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += ALPHABET[(n >>> 18) & 63] + ALPHABET[(n >>> 12) & 63];
    if (i + 1 < bytes.length) out += ALPHABET[(n >>> 6) & 63];
    if (i + 2 < bytes.length) out += ALPHABET[n & 63];
  }
  return out;
}

export function base64UrlDecode(input: string): Uint8Array {
  const clean = input.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  if (!/^[A-Za-z0-9_-]*$/.test(clean) || clean.length % 4 === 1) throw new Error('Invalid base64url input');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const chunk = clean.slice(i, i + 4);
    const values = [...chunk].map(ch => ALPHABET.indexOf(ch));
    const n = (values[0] << 18) | (values[1] << 12) | ((values[2] ?? 0) << 6) | (values[3] ?? 0);
    bytes.push((n >>> 16) & 255);
    if (chunk.length > 2) bytes.push((n >>> 8) & 255);
    if (chunk.length > 3) bytes.push(n & 255);
  }
  return new Uint8Array(bytes);
}

/** Manual UTF-8 codec: TextDecoder is not guaranteed on every Hermes release. */
export function utf8Encode(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return new Uint8Array(out);
}

export function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  const cont = (k: number) => {
    const b = bytes[i + k];
    if (b === undefined || (b & 0xc0) !== 0x80) throw new Error('Invalid UTF-8');
    return b & 63;
  };
  while (i < bytes.length) {
    const b = bytes[i];
    let cp: number;
    let len: number;
    if (b < 0x80) { cp = b; len = 1; }
    else if ((b & 0xe0) === 0xc0) { cp = ((b & 31) << 6) | cont(1); len = 2; if (cp < 0x80) throw new Error('Invalid UTF-8'); }
    else if ((b & 0xf0) === 0xe0) { cp = ((b & 15) << 12) | (cont(1) << 6) | cont(2); len = 3; if (cp < 0x800) throw new Error('Invalid UTF-8'); }
    else if ((b & 0xf8) === 0xf0) { cp = ((b & 7) << 18) | (cont(1) << 12) | (cont(2) << 6) | cont(3); len = 4; if (cp < 0x10000 || cp > 0x10ffff) throw new Error('Invalid UTF-8'); }
    else throw new Error('Invalid UTF-8');
    out += String.fromCodePoint(cp);
    i += len;
  }
  return out;
}
