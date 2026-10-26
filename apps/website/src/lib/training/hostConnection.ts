import type { Credentials, Session } from './types';

type Cancel = () => void;
type Options = {
	credentials: Credentials;
	api: (path: string) => Promise<unknown>;
	onSnapshot: (session: Session) => void;
	onConnected: (connected: boolean) => void;
	onError: (message: string | null) => void;
	createSocket?: (url: string) => WebSocket;
	repeat?: (callback: () => void, ms: number) => Cancel;
	later?: (callback: () => void, ms: number) => Cancel;
	now?: () => number;
};

export function connectTrainingHost(options: Options): Cancel {
	const { credentials, api, onSnapshot, onConnected, onError } = options;
	const now = options.now ?? Date.now;
	const createSocket = options.createSocket ?? ((url: string) => new WebSocket(url));
	const repeat =
		options.repeat ??
		((callback, ms) => {
			const timer = setInterval(callback, ms);
			return () => clearInterval(timer);
		});
	const later =
		options.later ??
		((callback, ms) => {
			const timer = setTimeout(callback, ms);
			return () => clearTimeout(timer);
		});
	let stopped = false,
		terminal = false,
		polling = false,
		socketHealthy = false;
	let lastSnapshot: number | null = null;
	let lastServerTime = -Infinity;
	let socket: WebSocket | undefined;
	let cancelRetry: Cancel | undefined;

	function fresh(): boolean {
		return lastSnapshot !== null && now() - lastSnapshot < 5000;
	}
	function accept(value: unknown) {
		const session = value as Partial<Session> | null;
		if (
			!session ||
			session.uuid !== credentials.uuid ||
			!Array.isArray(session.participants) ||
			!session.video ||
			typeof session.serverTime !== 'number' ||
			!Number.isFinite(session.serverTime)
		)
			throw new Error('Could not read the training session.');
		// A slow HTTP response must not roll playback back after a newer socket frame.
		if (session.serverTime < lastServerTime) return;
		lastServerTime = session.serverTime;
		lastSnapshot = now();
		onSnapshot(session as Session);
		onConnected(true);
		onError(null);
	}
	async function poll() {
		if (stopped || terminal) return;
		onConnected(fresh());
		if (polling || (socketHealthy && lastSnapshot !== null && now() - lastSnapshot < 3000)) return;
		polling = true;
		try {
			const session = await api(`sessions/${credentials.uuid}`);
			if (!stopped && !terminal) accept(session);
		} catch (error) {
			if (!stopped && !terminal && !fresh())
				onError(error instanceof Error ? error.message : 'Could not refresh training.');
		} finally {
			polling = false;
		}
	}
	function detach() {
		if (!socket) return;
		socket.onopen = null;
		socket.onmessage = null;
		socket.onclose = null;
		socket.onerror = null;
		socket.close();
		socket = undefined;
	}
	function retry() {
		cancelRetry?.();
		if (!stopped && !terminal) cancelRetry = later(() => void connectSocket(), 2000);
	}
	async function connectSocket() {
		if (stopped || terminal) return;
		detach();
		socketHealthy = false;
		try {
			// Refresh after every disconnect: an open tab may predate a deployment.
			const config = (await api('config')) as { socketUrl: string };
			if (stopped || terminal) return;
			const active = createSocket(config.socketUrl);
			socket = active;
			active.onopen = () => {
				if (!stopped && socket === active)
					active.send(
						JSON.stringify({ sessionUuid: credentials.uuid, token: credentials.browserToken })
					);
			};
			active.onmessage = ({ data }) => {
				if (stopped || terminal || socket !== active) return;
				try {
					accept(JSON.parse(data));
					socketHealthy = true;
				} catch {
					socketHealthy = false;
					void poll();
				}
			};
			active.onclose = ({ code }) => {
				if (stopped || socket !== active) return;
				socketHealthy = false;
				if (code === 1008) {
					terminal = true;
					onConnected(false);
					onError('Session expired or unavailable. Start a new session.');
				} else {
					void poll();
					retry();
				}
			};
			active.onerror = () => {
				if (!stopped && socket === active) {
					socketHealthy = false;
					void poll();
				}
			};
		} catch {
			if (!stopped) {
				void poll();
				retry();
			}
		}
	}
	const stopPolling = repeat(() => void poll(), 1500);
	void poll();
	void connectSocket();
	return () => {
		stopped = true;
		cancelRetry?.();
		stopPolling();
		detach();
	};
}
