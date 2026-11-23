/** Synthetic binary fixtures (no real photos or documents). */
export function jpegWithExif(secret = 'GPS 44.4949N 11.3426E SYNTHETIC'): Buffer {
 const seg = (marker: number, payload: Buffer) => { const h = Buffer.alloc(4); h[0] = 0xff; h[1] = marker; h.writeUInt16BE(payload.length + 2, 2); return Buffer.concat([h, payload]); };
 const app0 = seg(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1'));
 const app1 = seg(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), Buffer.from(secret)]));
 const app13 = seg(0xed, Buffer.from('Photoshop 3.0\0IPTC ' + secret, 'latin1'));
 const dqt = seg(0xdb, Buffer.alloc(65, 1));
 const sos = Buffer.concat([seg(0xda, Buffer.from([1, 1, 0, 0, 63, 0])), Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56]), Buffer.from([0xff, 0xd9])]);
 return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, app1, app13, dqt, sos]);
}
export const pngBytes = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('synthetic-png-body')]);
export const pdfBytes = () => Buffer.from('%PDF-1.7\n% synthetic test document\n%%EOF\n', 'latin1');
export const heicBytes = () => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic', 'latin1'), Buffer.alloc(16)]);
