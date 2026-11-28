// Snackbar replacement: one message at a time, like Flutter's ScaffoldMessenger.

export interface ToastAction {
	label: string;
	run: () => void;
}

export interface Toast {
	id: number;
	message: string;
	detail?: string;
	action?: ToastAction;
	tone: 'normal' | 'error';
}

class ToastStore {
	current = $state<Toast | null>(null);
	private nextId = 1;
	private timer: ReturnType<typeof setTimeout> | null = null;

	show(
		message: string,
		options: { detail?: string; action?: ToastAction; tone?: 'normal' | 'error'; duration?: number } = {}
	) {
		if (this.timer) clearTimeout(this.timer);
		const toast: Toast = {
			id: this.nextId++,
			message,
			detail: options.detail,
			action: options.action,
			tone: options.tone ?? 'normal'
		};
		this.current = toast;
		this.timer = setTimeout(() => {
			if (this.current?.id === toast.id) this.current = null;
		}, options.duration ?? 4000);
	}

	error(message: string) {
		this.show(message, { tone: 'error' });
	}

	dismiss() {
		this.current = null;
	}
}

export const toast = new ToastStore();
