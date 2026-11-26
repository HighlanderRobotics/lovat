import { describe, expect, it } from 'vitest';
import { ChunkedReport, parseChunk } from './scoutReportChunks.ts';

const code = (index: number, data: string, uuid = 'r1', total = 2) =>
	`lovat://report?d=${encodeURIComponent(JSON.stringify({ uuid, index, total, data }))}`;

describe('scout report QR chunks', () => {
	it('reassembles chunks in index order', () => {
		const report = new ChunkedReport(parseChunk(code(1, 'world"}')));
		expect(report.isComplete).toBe(false);
		expect(report.add(parseChunk(code(0, '{"hello":"')))).toBe(true);
		expect(report.isComplete).toBe(true);
		expect(JSON.parse(report.data)).toEqual({ hello: 'world' });
	});

	it('ignores a chunk scanned twice', () => {
		const report = new ChunkedReport(parseChunk(code(0, 'a')));
		expect(report.add(parseChunk(code(0, 'a')))).toBe(false);
		expect(report.chunks).toHaveLength(1);
	});

	it('rejects codes that are not Lovat reports', () => {
		expect(() => parseChunk('https://example.com')).toThrow('Invalid QR code');
		expect(() => parseChunk('not a url')).toThrow('Invalid QR code');
	});
});
