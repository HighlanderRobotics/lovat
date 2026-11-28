// Lovat Collection splits a scout report across several QR codes. Each code
// is a URL whose `d` query parameter holds {uuid, index, total, data}.

export interface ReportChunk {
	uuid: string;
	index: number;
	total: number;
	data: string;
}

export function parseChunk(encoded: string): ReportChunk {
	let raw: string | null = null;
	try {
		raw = new URL(encoded).searchParams.get('d');
	} catch {
		raw = null;
	}
	if (!raw) throw new Error('Invalid QR code');
	const chunk = JSON.parse(raw);
	if (typeof chunk.uuid !== 'string' || typeof chunk.index !== 'number' || typeof chunk.total !== 'number') {
		throw new Error('Invalid QR code');
	}
	return chunk as ReportChunk;
}

export class ChunkedReport {
	readonly chunks: ReportChunk[];

	constructor(first: ReportChunk) {
		this.chunks = [first];
	}

	get uuid() {
		return this.chunks[0].uuid;
	}

	get total() {
		return this.chunks[0].total;
	}

	get isComplete() {
		return this.chunks.length === this.total;
	}

	/** Returns false when the chunk was already scanned. */
	add(chunk: ReportChunk): boolean {
		if (this.chunks.some((c) => c.index === chunk.index)) return false;
		this.chunks.push(chunk);
		return true;
	}

	get data(): string {
		if (!this.isComplete) throw new Error('Report is not complete');
		return [...this.chunks].sort((a, b) => a.index - b.index).map((c) => c.data).join('');
	}
}
