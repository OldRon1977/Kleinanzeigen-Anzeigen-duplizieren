import { describe, it, expect } from 'vitest';
import helper from '../helper.user.js';

const { buildZip, utf8 } = helper;

describe('buildZip', () => {
    it('erzeugt einen gueltigen STORE-only-ZIP-Blob mit 2 Eintraegen', async () => {
        const files = [
            { name: 'a/data.json', data: utf8('{"hello":"world"}') },
            { name: 'a/image_01.jpg', data: new Uint8Array([1, 2, 3, 4, 5]) }
        ];

        const blob = await buildZip(files);
        expect(blob).toBeInstanceOf(Blob);
        expect(blob.type).toBe('application/zip');

        const buf = new Uint8Array(await blob.arrayBuffer());
        const dv = new DataView(buf.buffer);

        // Beginnt mit Local-File-Header-Signatur PK\x03\x04
        expect(buf[0]).toBe(0x50); // P
        expect(buf[1]).toBe(0x4b); // K
        expect(buf[2]).toBe(0x03);
        expect(buf[3]).toBe(0x04);

        // EOCD-Signatur (0x06054b50, little-endian) suchen
        let eocdOffset = -1;
        for (let i = buf.length - 22; i >= 0; i--) {
            if (dv.getUint32(i, true) === 0x06054b50) {
                eocdOffset = i;
                break;
            }
        }
        expect(eocdOffset).toBeGreaterThanOrEqual(0);

        // Eintragszahl im EOCD: Eintraege auf dieser Disk (+8) und gesamt (+10) = 2
        expect(dv.getUint16(eocdOffset + 8, true)).toBe(2);
        expect(dv.getUint16(eocdOffset + 10, true)).toBe(2);
    });
});
