/** Content sniffing: the declared Content-Type is never trusted. */
export const MAX_EVIDENCE_BYTES = 15 * 1024 * 1024;
export const EVIDENCE_KINDS = ['boiler', 'heating', 'envelope', 'window', 'floorplan', 'document'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export type SniffedType = 'image/jpeg' | 'image/png' | 'image/heic' | 'application/pdf';

export function sniffMimeType(buf: Buffer): SniffedType | null {
 if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
 if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
 if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
 if (buf.length >= 12 && buf.subarray(4, 8).toString('latin1') === 'ftyp') {
  const brand = buf.subarray(8, 12).toString('latin1');
  if (['heic', 'heix', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) return 'image/heic';
 }
 return null;
}

/** Floor plans and documents may be PDF; photo kinds must be images. */
export function isAllowedForKind(kind: EvidenceKind, mime: SniffedType): boolean {
 if (mime === 'application/pdf') return kind === 'floorplan' || kind === 'document';
 return true;
}

/**
 * Removes JPEG APP1 (EXIF/XMP, incl. GPS position) and APP13 (IPTC) segments: photos of a home
 * can reveal location and device data. Returns null if the JPEG structure is not as expected.
 */
export function stripJpegMetadata(buf: Buffer): Buffer | null {
 if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
 const parts: Buffer[] = [buf.subarray(0, 2)];
 let i = 2;
 while (i + 4 <= buf.length) {
  if (buf[i] !== 0xff) return null;
  const marker = buf[i + 1];
  if (marker === 0xd9) { parts.push(buf.subarray(i)); return Buffer.concat(parts); }
  if (marker === 0xda) { parts.push(buf.subarray(i)); return Buffer.concat(parts); } // start of scan: rest is image data
  if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { parts.push(buf.subarray(i, i + 2)); i += 2; continue; }
  const len = buf.readUInt16BE(i + 2);
  if (len < 2 || i + 2 + len > buf.length) return null;
  if (marker !== 0xe1 && marker !== 0xed) parts.push(buf.subarray(i, i + 2 + len));
  i += 2 + len;
 }
 return null;
}

export type ScanStatus = 'unscanned' | 'clean' | 'infected';
/** Malware scanning port; the default reports "unscanned" and downloads are then gated by configuration. */
export interface MalwareScanner { scan(data: Buffer): Promise<ScanStatus> }
export const notConfiguredScanner: MalwareScanner = { scan: async () => 'unscanned' };
