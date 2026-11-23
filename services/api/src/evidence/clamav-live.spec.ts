import { describe, expect, it } from 'vitest';
import { ClamdScanner } from './clamav';

/** Against a real clamd (CI service). The EICAR test string is assembled at run time; it is harmless by design. */
describe.skipIf(process.env.RUN_CLAMAV !== '1')('real ClamAV', () => {
 const scanner = new ClamdScanner(process.env.CLAMAV_HOST ?? '127.0.0.1', Number(process.env.CLAMAV_PORT ?? 3310));
 const eicar = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join('');
 it('detects the EICAR test file', async () => expect(await scanner.scan(Buffer.from(eicar, 'ascii'))).toBe('infected'));
 it('passes a clean file', async () => expect(await scanner.scan(Buffer.from('%PDF-1.7\n% synthetic clean document\n%%EOF\n'))).toBe('clean'));
});
