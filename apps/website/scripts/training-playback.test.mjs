import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
let server, createTrainingPlayback;
before(async () => {
	server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
	({ createTrainingPlayback } = await server.ssrLoadModule('/src/lib/training/playback.ts'));
});
after(async () => server?.close());
const settle = () => new Promise((r) => setImmediate(r));
function fixture() {
	let time = 0,
		current = 7,
		play = async () => {},
		end = async () => {},
		interrupt = async () => {};
	const calls = [],
		states = [],
		errors = [];
	const player = {
		mute() {
			calls.push('mute');
		},
		unMute() {
			calls.push('unMute');
		},
		playVideo() {
			calls.push('playVideo');
		},
		pauseVideo() {
			calls.push('pauseVideo');
		},
		seekTo(n) {
			calls.push(['seekTo', n]);
			current = n;
		},
		getCurrentTime: () => current
	};
	const controller = createTrainingPlayback({
		offset: 7,
		duration: 163,
		postMatchSeconds: 15,
		now: () => time,
		onPlaying: async () => {
			calls.push('start');
			await play();
		},
		onEnded: async () => {
			calls.push('end');
			await end();
		},
		onInterrupted: async (n) => {
			calls.push(['interrupt', n]);
			await interrupt();
		},
		onError: (e) => errors.push(e),
		onState: (s) => states.push(s)
	});
	controller.ready(player);
	const beforePreview = states.at(-1);
	void controller.changed(1);
	const previewCalls = [...calls];
	calls.length = 0;
	return {
		beforePreview,
		previewCalls,
		controller,
		calls,
		states,
		errors,
		setTime: (n) => (time = n),
		setCurrent: (n) => (current = n),
		setPlay: (f) => (play = f),
		setEnd: (f) => (end = f),
		setInterrupt: (f) => (interrupt = f),
		start: async () => {
			controller.play(true);
			await controller.changed(1);
		},
		advance: async (seconds) => {
			for (let n = Math.floor(current - 7) + 1; n <= seconds; n++) {
				current = 7 + n;
				time = n * 1000;
				controller.tick();
				await settle();
			}
		}
	};
}
test('paused preview is before match start and never starts a report', async () => {
	const f = fixture();
	await f.controller.changed(1);
	f.controller.play(false);
	assert(!f.calls.includes('start'));
	assert(!f.calls.includes('playVideo'));
	assert.equal(f.states.at(-1).ready, true);
	assert.equal(f.beforePreview.ready, false);
	assert.deepEqual(f.previewCalls, [
		'mute',
		['seekTo', 4],
		'playVideo',
		'pauseVideo',
		['seekTo', 4]
	]);
	await f.start();
	assert.deepEqual(f.calls.slice(-4), [['seekTo', 7], 'unMute', 'playVideo', 'start']);
	f.controller.stop();
});
test('video continues fifteen seconds after report boundary and finishes once', async () => {
	const f = fixture();
	await f.start();
	await f.advance(163);
	assert(!f.calls.includes('end'));
	await f.advance(178);
	assert.equal(f.calls.filter((c) => c === 'end').length, 1);
	f.controller.tick();
	await f.controller.changed(0);
	assert.equal(f.calls.filter((c) => c === 'end').length, 1);
	f.controller.stop();
});
for (const kind of [
	'pause',
	'early end',
	'backwards seek',
	'forwards seek',
	'buffer',
	'player error'
])
	test(`${kind} invalidates active playback exactly once`, async () => {
		const f = fixture();
		await f.start();
		f.setCurrent(kind === 'backwards seek' ? 5 : kind === 'forwards seek' ? 20 : 8);
		if (kind === 'pause') await f.controller.changed(2);
		else if (kind === 'early end') await f.controller.changed(0);
		else if (kind === 'player error') f.controller.fail();
		else if (kind === 'buffer') {
			f.controller.tick();
			f.setTime(1000);
			f.controller.tick();
			f.setTime(2600);
			f.controller.tick();
		} else f.controller.tick();
		await settle();
		assert.equal(
			f.calls.filter((call) => Array.isArray(call) && call[0] === 'interrupt').length,
			1
		);
		await f.controller.changed(2);
		assert.equal(
			f.calls.filter((call) => Array.isArray(call) && call[0] === 'interrupt').length,
			1
		);
		f.controller.stop();
	});
test('post-match interruption retains original elapsed time across failed save/reconnect', async () => {
	const f = fixture();
	await f.start();
	await f.advance(165);
	f.setInterrupt(async () => {
		throw new Error('offline');
	});
	await f.controller.changed(2);
	assert.equal(f.states.at(-1).interruptFailed, true);
	f.setCurrent(300);
	f.setInterrupt(async () => {});
	await f.controller.retryInterrupt();
	assert.deepEqual(
		f.calls.filter((call) => Array.isArray(call) && call[0] === 'interrupt'),
		[
			['interrupt', 165],
			['interrupt', 165]
		]
	);
	assert.match(f.errors.at(-1), /completed match is preserved/);
	f.controller.stop();
});
test('lost play acknowledgement invalidates rather than starting a fresh clock', async () => {
	const f = fixture();
	f.setPlay(async () => {
		throw new Error('lost acknowledgement');
	});
	await f.start();
	assert.equal(f.calls.filter((c) => c === 'start').length, 1);
	assert.equal(f.calls.filter((call) => Array.isArray(call) && call[0] === 'interrupt').length, 1);
	f.controller.play(true);
	assert.equal(f.calls.filter((c) => c === 'playVideo').length, 1);
	f.controller.stop();
});
test('failed completion can retry without starting or interrupting the match again', async () => {
	const f = fixture();
	await f.start();
	f.setEnd(async () => {
		throw new Error('offline');
	});
	await f.advance(178);
	assert.equal(f.states.at(-1).finishFailed, true);
	f.setEnd(async () => {});
	await f.controller.retryFinish();
	assert.equal(f.states.at(-1).finishFailed, false);
	assert.equal(f.calls.filter((c) => c === 'start').length, 1);
	assert.equal(f.calls.filter((call) => Array.isArray(call) && call[0] === 'interrupt').length, 0);
	f.controller.stop();
});
test('cleanup ignores pending start acknowledgement and all later player events', async () => {
	const f = fixture();
	let resolve;
	f.setPlay(() => new Promise((r) => (resolve = r)));
	const pending = f.start();
	await settle();
	f.controller.stop();
	const n = f.states.length;
	resolve();
	await pending;
	f.controller.tick();
	f.controller.fail();
	await f.controller.changed(0);
	assert.equal(f.states.length, n);
	assert.equal(
		f.calls.filter((c) => c === 'end' || (Array.isArray(c) && c[0] === 'interrupt')).length,
		0
	);
});

test('pausing while the Play acknowledgement is in flight invalidates the attempt', async () => {
	const f = fixture();
	let resolve;
	f.setPlay(() => new Promise((r) => (resolve = r)));
	const pending = f.start();
	await settle();
	await f.controller.changed(2);
	resolve();
	await pending;
	assert.equal(f.calls.filter((call) => Array.isArray(call) && call[0] === 'interrupt').length, 1);
	f.controller.stop();
});
test('a late Play acknowledgement cannot silently shift the scouting timeline', async () => {
	const f = fixture();
	let resolve;
	f.setPlay(() => new Promise((r) => (resolve = r)));
	const pending = f.start();
	await settle();
	f.setCurrent(20);
	resolve();
	await pending;
	assert.equal(f.calls.filter((call) => Array.isArray(call) && call[0] === 'interrupt').length, 1);
	f.controller.stop();
});
