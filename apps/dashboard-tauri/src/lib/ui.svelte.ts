import { goto } from '$app/navigation';

class UiState {
	drawerOpen = $state(false);
}

export const ui = new UiState();

/** Back navigation with a sensible fallback for deep-linked pages. */
export function goBack(fallback = '/home') {
	if (history.length > 1) history.back();
	else void goto(fallback);
}
