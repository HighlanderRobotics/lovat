import { text } from '@sveltejs/kit';

export const GET = () => text('ok', { headers: { 'cache-control': 'no-store' } });
