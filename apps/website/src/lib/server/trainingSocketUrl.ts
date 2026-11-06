export function trainingSocketUrl(env: Record<string, string | undefined>): string {
	const configured = env.LOVAT_PUBLIC_API_BASE || env.RAILWAY_SERVICE_API_URL || env.LOVAT_API_BASE;
	if (!configured) throw new Error('Training server is not configured.');
	const base = new URL(configured.includes('://') ? configured : `https://${configured}`);
	const local = ['localhost', '127.0.0.1'].includes(base.hostname);
	if (
		base.hostname.endsWith('.railway.internal') ||
		!['https:', 'http:'].includes(base.protocol) ||
		(base.protocol === 'http:' && !local)
	)
		throw new Error('Training requires a public HTTPS API URL.');
	base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
	base.username = '';
	base.password = '';
	base.search = '';
	base.hash = '';
	base.pathname = '/collection/training/socket';
	return base.toString();
}
