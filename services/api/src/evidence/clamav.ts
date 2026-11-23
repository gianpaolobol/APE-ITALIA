import { connect } from 'node:net';
import type { MalwareScanner, ScanStatus } from './file-policy';

export class ScannerUnavailableError extends Error { constructor(message: string) { super(message); this.name = 'ScannerUnavailableError'; } }

/**
 * ClamAV adapter speaking the clamd INSTREAM protocol over TCP. Any transport or protocol error throws
 * ScannerUnavailableError: callers must fail closed (never treat an unanswered scan as clean).
 */
export class ClamdScanner implements MalwareScanner {
 constructor(private readonly host: string, private readonly port = 3310, private readonly timeoutMs = 30_000, private readonly chunkSize = 64 * 1024) {}

 scan(data: Buffer): Promise<ScanStatus> {
  return new Promise((resolve, reject) => {
   const socket = connect({ host: this.host, port: this.port });
   const chunks: Buffer[] = [];
   let settled = false;
   const fail = (msg: string) => { if (!settled) { settled = true; socket.destroy(); reject(new ScannerUnavailableError(msg)); } };
   socket.setTimeout(this.timeoutMs, () => fail('clamd timeout'));
   socket.on('error', () => fail('clamd connection error'));
   socket.on('data', c => chunks.push(c));
   socket.on('end', () => {
    if (settled) return;
    const reply = Buffer.concat(chunks).toString('utf8').replace(/\0/g, '').trim();
    settled = true;
    if (/^stream: OK$/.test(reply)) resolve('clean');
    else if (/^stream: .+ FOUND$/.test(reply)) resolve('infected');
    else reject(new ScannerUnavailableError('clamd unexpected reply'));
   });
   socket.on('connect', () => {
    socket.write('zINSTREAM\0');
    for (let i = 0; i < data.length; i += this.chunkSize) {
     const part = data.subarray(i, i + this.chunkSize);
     const len = Buffer.alloc(4);
     len.writeUInt32BE(part.length, 0);
     socket.write(len);
     socket.write(part);
    }
    socket.end(Buffer.alloc(4)); // zero-length chunk terminates the stream
   });
  });
 }
}

export function scannerFromEnv(env = process.env): MalwareScanner | null {
 if (!env.CLAMAV_HOST) return null;
 const port = Number(env.CLAMAV_PORT ?? 3310);
 return new ClamdScanner(env.CLAMAV_HOST, Number.isInteger(port) && port > 0 ? port : 3310);
}
