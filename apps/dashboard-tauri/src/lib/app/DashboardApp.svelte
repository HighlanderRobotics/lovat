<script lang="ts">
	import { page } from '$app/state';
	import { goto, beforeNavigate, afterNavigate } from '$app/navigation';
	import { onMount, untrack, tick, setContext } from 'svelte';
	import { Button, TextField } from '@highlanderrobotics/magnolia-svelte/v2';
	import {
		referenceCatalog as manifest,
		referenceFrame,
		referenceLayout,
		sceneKey,
		resolveRoute,
	} from '#lib/design/references.ts';
	import {
		routes,
		routePath,
		parentRoute,
		isViewChange,
		type RouteName,
	} from '#lib/app/routing/routes.ts';

	import type { ScreenLayout } from '#lib/design/layout.ts';
	import NodeView from '#lib/design/DesignNode.svelte';
	import { type DesignNode } from '#lib/design/model.ts';
	import {
		DashboardSession,
		DASHBOARD_SESSION,
	} from '#lib/app/session.svelte.ts';
	import { prepareScene } from '#lib/design/runtime.svelte.ts';
	import { optionScreens } from '#lib/features/questions/routes.ts';
	import { actionForNode } from '#lib/design/actions.ts';
	import { dispatch, type AppAction } from '#lib/app/actions.ts';
	import {
		presentation,
		apiToolbar,
		type Presentation,
		type Dock,
	} from '#lib/design/presentation.ts';

	import {
		navbarDirection,
		navbarLabel,
		revisitDelta,
	} from '#lib/app/routing/history.ts';
	import LoadingView from '#lib/shared/loading/LoadingView.svelte';
	import { screenFor } from '#lib/app/screens.ts';
	import SubmissionNotice from '#lib/shared/forms/SubmissionNotice.svelte';
	import { preloadSceneAssets } from '#lib/shared/loading/sceneAssets.ts';
	import { submitMock } from '#lib/shared/forms/submission.svelte.ts';
	import { PageMotion } from '#lib/app/routing/pageMotion.ts';
	import '#lib/design/design.css';
	import '#lib/shared/motion/motion.css';

	const runtime = new DashboardSession();
	setContext(DASHBOARD_SESSION, runtime);
	const sources = import.meta.glob('../design/scenes/*.json', {
		import: 'default',
	});
	const id = $derived(resolveRoute(page.url.pathname));
	const catalog = $derived(page.url.pathname === '/design');
	const reference = $derived(page.url.searchParams.has('reference'));
	const nativeScreen = $derived(screenFor(id, runtime));
	const Screen = $derived(nativeScreen?.component);
	const frame = $derived(
		referenceFrame(id) ??
			(Screen ? { id, name: routes[id].title, height: 852 } : undefined),
	);
	const cache = new Map<string, DesignNode>();
	const pendingScenes = new Map<string, Promise<DesignNode>>();
	let hasEntered = $state(false),
		loadRevision = $state(0),
		pendingTarget = $state<RouteName>();
	let loadFailure = $state<{ target: RouteName; message: string }>();
	let retrySubmission: (() => void) | undefined;
	const questionEditorIds = ['questions.type', ...Object.values(optionScreens)];
	const newQuestionPage = $derived(
		runtime.questions.creatingQuestion && questionEditorIds.includes(id),
	);
	function load(target: RouteName): DesignNode | Promise<DesignNode> {
		const key = `${reference ? 'reference:' : ''}${target}`;
		const isReference = reference;
		const cached = cache.get(key);
		if (cached) return cached;
		const inFlight = pendingScenes.get(key);
		if (inFlight) return inFlight;
		const source =
			sources[sceneKey(target).replace('./scenes/', '../design/scenes/')];
		if (!source) {
			const screen = screenFor(target, runtime);
			if (!screen)
				return Promise.reject(new Error('This page is unavailable.'));
			const empty: DesignNode = {
				tag: 'div',
				name: routes[target].title,
				style: '',
				children: [],
			};
			const loading = Promise.all([
				screen.preload?.(runtime),
				preloadSceneAssets(empty),
			])
				.then(() => {
					cache.set(key, empty);
					return empty;
				})
				.finally(() => pendingScenes.delete(key));
			pendingScenes.set(key, loading);
			return loading;
		}
		const loading = (source() as Promise<DesignNode>)
			.then(async (source) => {
				const node = isReference
					? source
					: prepareScene(source, target, runtime);
				await Promise.all([
					preloadSceneAssets(node),
					screenFor(target, runtime)?.preload?.(runtime),
				]);
				cache.set(key, node);
				return node;
			})
			.finally(() => pendingScenes.delete(key));
		pendingScenes.set(key, loading);
		return loading;
	}
	let navbarTemplate: DesignNode | undefined;
	$effect(() => {
		const current = page.state.activeTab ?? id;
		const route = id;
		untrack(() => {
			runtime.currentTab = navbarLabel(current) ?? runtime.currentTab;
			runtime.currentRoute = route;
		});
	});
	const presentations = new WeakMap<DesignNode, Presentation>();
	function parts(node: DesignNode, frameId: RouteName): Presentation {
		const origin = page.state.modalOrigin;
		const base = origin
			? cache.get(`${reference ? 'reference:' : ''}${origin}`)
			: undefined;
		if (
			base &&
			base !== node &&
			node.children.some(
				(child) => typeof child !== 'string' && child.dialogSurface,
			)
		) {
			const background = parts(base, origin!);
			return {
				page: {
					...background.page,
					children: [
						{
							tag: 'div',
							name: 'ModalBackground',
							style: 'display:contents',
							inert: true,
							children: background.page.children,
						},
						...node.children.filter(
							(child) =>
								typeof child !== 'string' &&
								(child.dialogSurface || child.name === 'DialogBackdrop'),
						),
					],
				},
				docks: background.docks,
				layout: { ...background.layout, ...referenceLayout(frameId) },
			};
		}
		let value = presentations.get(node);
		if (!value) {
			value = presentation(node, referenceLayout(frameId), reference);
			presentations.set(node, value);
		}
		const nav = value.docks.find((dock) => dock.key.startsWith('nav:'));
		if (nav) navbarTemplate = nav.node;
		if (page.state.activeTab && !nav && navbarTemplate) {
			const layout: ScreenLayout = {
				...value.layout,
				'runtime:navbar': { kind: 'nav' as const, x: 0, y: 0, w: 393, h: 52 },
			};
			for (const [key, anchor] of Object.entries(layout))
				if (anchor.kind === 'body')
					layout[key] = { ...anchor, bottom: Math.max(anchor.bottom ?? 0, 52) };
			return {
				...value,
				layout,
				docks: [
					...value.docks,
					{ key: 'nav:0', node: { ...navbarTemplate, id: 'runtime:navbar' } },
				],
			};
		}
		return value;
	}
	let docks = $state<Dock[]>([]);
	let dockLayout = $state<ScreenLayout>({});
	$effect(() => {
		const current = scene,
			frameId = id,
			keyCount = runtime.count('api-keys');
		if (current)
			untrack(() => {
				void Promise.resolve(current)
					.then((node) => {
						if (id === frameId) {
							const value = parts(node, frameId);
							if (!reference && runtime.scope(frameId) === 'api-keys') {
								docks = apiToolbar(keyCount);
								dockLayout = {
									...value.layout,
									'runtime:api-toolbar': {
										kind: 'footer',
										x: 26,
										y: 0,
										w: 341,
										h: keyCount === 1 ? 98 : 44,
										bottom: 26,
										blockX: 0,
										blockY: 0,
									},
								};
							} else {
								docks = value.docks;
								dockLayout = value.layout;
							}
						}
					})
					.catch(() => {});
			});
	});
	const scene = $derived.by(() => {
		loadRevision;
		return frame ? load(id) : undefined;
	});
	$effect(() => {
		const current = scene,
			currentId = id;
		if (current)
			untrack(() => {
				void Promise.resolve(current)
					.then(() => {
						if (id === currentId) hasEntered = true;
					})
					.catch(() => {});
			});
	});
	let width = $state(393);
	let viewport = $state<HTMLElement>();
	let safeTop = $state(0);
	let safeBottom = $state(0);
	let availableHeight = $state(0);
	let keyboardInset = $state(0);
	let stableHeight = 0;
	function measure() {
		if (!viewport) return;
		const focused =
			document.activeElement instanceof HTMLInputElement ||
			document.activeElement instanceof HTMLTextAreaElement;
		const visual = window.visualViewport;
		const preserving = focused || keyboardInset > 80;
		if (!preserving || !stableHeight) stableHeight = window.innerHeight;
		const height = preserving
			? Math.max(stableHeight, window.innerHeight)
			: window.innerHeight;
		keyboardInset = preserving
			? Math.max(
					0,
					height - (visual?.height ?? height) - (visual?.offsetTop ?? 0),
				)
			: 0;
		safeTop = parseFloat(getComputedStyle(viewport).paddingTop) || 0;
		safeBottom = parseFloat(getComputedStyle(viewport).paddingBottom) || 0;
		availableHeight = height - safeTop - safeBottom;
		if (keyboardInset > 80)
			requestAnimationFrame(() => {
				const input = document.activeElement as HTMLElement;
				const body = input.closest('[data-layout-role="body"]');
				if (body) {
					const field = input.getBoundingClientRect(),
						box = body.getBoundingClientRect();
					if (field.bottom > box.bottom - 12)
						body.scrollTop += field.bottom - box.bottom + 12;
				}
			});
	}
	$effect(() => {
		const element = viewport;
		if (element) untrack(measure);
	});
	let filter = $state('');
	let choices = $state<Record<string, string>>({});
	function choose(group: string, value: string) {
		choices[group] = value;
	}
	const scale = $derived(Math.min(width / 393, 1));
	const displayHeight = $derived(
		!reference && availableHeight > 0
			? availableHeight / scale
			: (frame?.height ?? 852),
	);
	const heightDelta = $derived(
		(frame?.height ?? displayHeight) - displayHeight,
	);
	const filtered = $derived(
		manifest.filter((item) =>
			`${item.name} ${item.id}`.toLowerCase().includes(filter.toLowerCase()),
		),
	);

	let navigationRequest = 0;
	let canvas = $state<HTMLElement>();
	let motionHost = $state<HTMLElement>();
	let animateNext = true;
	let nextDirection: 'forward' | 'back' = 'forward';
	let traversalDirection: 'forward' | 'back' | undefined;
	const motion = new PageMotion();
	runtime.onSelectionChange = undefined;
	async function open(
		target: RouteName,
		remember = true,
		direction: 'forward' | 'back' = 'forward',
		navbar = false,
	) {
		if (target === id && !catalog) return;
		runtime.submission.reset();
		retrySubmission = undefined;
		if (isViewChange(id, target)) remember = false;
		if (routes[id].viewOf && !routes[target].viewOf)
			runtime.values[`search:${runtime.scope(id)}`] = '';
		const request = ++navigationRequest;
		loadFailure = undefined;
		if (
			target !== 'catalog' &&
			!cache.has(`${reference ? 'reference:' : ''}${target}`)
		)
			pendingTarget = target;
		let targetNode: DesignNode | undefined;
		try {
			targetNode = target !== 'catalog' ? await load(target) : undefined;
		} catch (error) {
			if (request === navigationRequest) {
				pendingTarget = undefined;
				loadFailure = {
					target,
					message:
						error instanceof Error
							? error.message
							: 'Try loading this page again.',
				};
			}
			return;
		}

		if (target === 'apiKeys.rename') {
			const record = runtime.apikeys.apiRecords?.find(
				(record) => runtime.apikeys.apiSelected[record.id],
			);
			if (record) runtime.values['apiKeys.name'] = record.name;
		}
		if (target === 'questions.option-edit' && runtime.questions.editingOption) {
			runtime.values['questions.option.label'] =
				runtime.questions.optionLabels[runtime.questions.editingOption.key] ??
				runtime.questions.editingOption.label;
			runtime.values['questions.option.hint'] =
				runtime.questions.optionHints[runtime.questions.editingOption.key] ??
				runtime.questions.editingOption.hint ??
				'';
		}
		const modal = !!targetNode?.children.some(
			(child) => typeof child !== 'string' && child.dialogSurface,
		);
		const origin = page.state.modalOrigin;
		if (modal || origin) remember = false;
		nextDirection = direction;
		animateNext =
			(remember || direction === 'back') &&
			target !== 'catalog' &&
			!targetNode?.children.some(
				(child) => typeof child !== 'string' && child.dialogSurface,
			);
		if (request !== navigationRequest) return;
		const optionType = Object.entries(optionScreens).find(
			([, screen]) => screen === target,
		)?.[0];
		if (optionType) runtime.questions.questionType = optionType;
		const delta = remember
			? revisitDelta(page.state.dashboardHistory ?? [], target)
			: 0;
		if (delta) {
			pendingTarget = undefined;
			traversalDirection = navbar ? direction : 'back';
			history.go(delta);
			return;
		}
		const url = routePath(target) + (reference ? '?reference=1' : '');
		await goto(url, {
			replace: !remember,
			state: {
				activeTab: navbar ? target : undefined,
				dashboardHistory: remember
					? [...(page.state.dashboardHistory ?? []), id]
					: (page.state.dashboardHistory ?? []),
				modalOrigin: modal ? (origin ?? id) : undefined,
			},
		});
		await tick();
		if (request === navigationRequest) pendingTarget = undefined;
	}
	beforeNavigate((navigation) => {
		if (navigation.type === 'popstate') {
			navigationRequest++;
			pendingTarget = undefined;
			loadFailure = undefined;
			runtime.submission.reset();
			retrySubmission = undefined;
		}
		if (navigation.type === 'popstate' && page.state.modalOrigin) {
			navigation.cancel();
			void open(page.state.modalOrigin, false);
			return;
		}
		if (navigation.type === 'popstate' && routes[id].viewOf)
			runtime.values[`search:${runtime.scope(id)}`] = '';
		if (viewport) {
			const body = viewport.querySelector('[data-layout-role="body"]');
			if (body) runtime.scrolls[id] = body.scrollTop;
		}
		const allowed =
			!reference &&
			!catalog &&
			!viewport?.querySelector('[role="dialog"]') &&
			(navigation.type === 'popstate' || animateNext);
		const direction =
			navigation.type === 'popstate'
				? (traversalDirection ?? (navigation.delta < 0 ? 'back' : 'forward'))
				: nextDirection;
		traversalDirection = undefined;
		if (allowed) motion.prepare(canvas, motionHost, direction);
		else motion.finish();
	});
	afterNavigate(() => {
		void tick().then(() => {
			motion.play(canvas);
			requestAnimationFrame(() => {
				const body = viewport?.querySelector('[data-layout-role="body"]');
				if (body) body.scrollTop = runtime.scrolls[id] ?? 0;
			});
		});
	});
	async function submitAction(
		fieldKey: string,
		mutation: () => void,
		target: RouteName,
	) {
		retrySubmission = () => void submitAction(fieldKey, mutation, target);
		const saved = await runtime.submission.run(
			() =>
				runtime.values[fieldKey]?.trim() ? {} : { [fieldKey]: 'Enter a name.' },
			() => submitMock(mutation),
		);
		if (saved) {
			runtime.submission.reset();
			void open(target);
		}
	}
	let noticeTimer: ReturnType<typeof setTimeout>;
	function notify(message: string) {
		clearTimeout(noticeTimer);
		runtime.members.promotionNotice = message;
		noticeTimer = setTimeout(
			() => (runtime.members.promotionNotice = ''),
			1500,
		);
	}
	function back() {
		if (page.state.modalOrigin) void open(page.state.modalOrigin, false);
		else if (page.state.dashboardHistory?.length) history.back();
		else void open(parentRoute(id), false, 'back');
	}
	function act(action: AppAction) {
		dispatch(action, {
			session: runtime,
			route: id,
			returnRoute: page.state.modalOrigin,
			open: (route, remember = true, direction, navbar = false) =>
				void open(
					route,
					remember,
					direction ?? (navbar ? navbarDirection(id, route) : 'forward'),
					navbar,
				),
			back,
			notify,
			choice: (key) => choices[key],
			submit: (field, mutation, target) =>
				void submitAction(field, mutation, target),
		});
	}
	function activate(node: DesignNode): boolean {
		const action = node.backAction
			? ({ type: 'navigation.back' } as const)
			: (node.action ?? actionForNode(id, node, runtime.scope(id)));
		if (!action) return false;
		act(action);
		return true;
	}

	onMount(() => {
		let focusMeasure = 0;
		const scheduleFocusMeasure = () => {
			cancelAnimationFrame(focusMeasure);
			focusMeasure = requestAnimationFrame(() => untrack(measure));
		};
		const orientation = () => {
			stableHeight = 0;
			keyboardInset = 0;
			measure();
		};
		screen.orientation?.addEventListener('change', orientation);
		const keyboard = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				if (page.state.modalOrigin) void open(page.state.modalOrigin, false);
				else void open('catalog');
			}
		};
		window.addEventListener('keydown', keyboard);
		window.addEventListener('resize', measure);
		document.addEventListener('focusin', scheduleFocusMeasure);
		document.addEventListener('focusout', scheduleFocusMeasure);
		window.visualViewport?.addEventListener('resize', measure);
		return () => {
			motion.finish();
			clearTimeout(noticeTimer);
			screen.orientation?.removeEventListener('change', orientation);
			window.removeEventListener('keydown', keyboard);
			window.removeEventListener('resize', measure);
			cancelAnimationFrame(focusMeasure);
			document.removeEventListener('focusin', scheduleFocusMeasure);
			document.removeEventListener('focusout', scheduleFocusMeasure);
			window.visualViewport?.removeEventListener('resize', measure);
		};
	});
</script>

<svelte:head
	><title
		>{catalog ? 'Screen catalog' : (frame?.name ?? 'Screen unavailable')} · Lovat</title
	></svelte:head
>

{#if catalog}
	<main class="design-catalog">
		<h1>Lovat Dashboard</h1>
		<p>{manifest.length} Figma screens and states · local mock data</p>
		<TextField
			label="Find a screen"
			placeholder="Search screens or Figma IDs"
			bind:value={filter}
		/>
		<Button onclick={() => open('home')}>Open Home</Button>
		{#each filtered as item}
			<a
				href={routePath(item.route)}
				onclick={(event) => {
					event.preventDefault();
					void open(item.route);
				}}><span>{item.name}</span><small>{item.id}</small></a
			>
		{/each}
	</main>
{:else if frame && scene}
	<main
		class="design-viewport"
		class:reference-mode={reference}
		class:profile-page={routes[id].profile}
		class:keyboard-open={keyboardInset > 80}
		class:creating-question={newQuestionPage}
		class:home-page={['home', 'home.search'].includes(id)}
		style={`--keyboard-inset:${Math.max(0, keyboardInset - safeBottom) / scale}px`}
		bind:this={viewport}
		bind:clientWidth={width}
		aria-label={frame.name}
	>
		<div
			style={`height:${displayHeight * scale}px;width:${393 * scale}px;position:relative;margin:auto`}
		>
			<div
				class="design-frame"
				data-frame={frame.id}
				style={`width:393px;height:${displayHeight}px;transform:scale(${scale});transform-origin:top left`}
			>
				{#await scene}<LoadingView
						splash={!hasEntered}
						label={`Loading ${frame.name}`}
					/>
				{:then node}{@const view = parts(node, id)}
					<div class="design-page" bind:this={canvas}>
						{#if Screen}<Screen session={runtime} route={id} onaction={act} />
						{:else}{#key id}<NodeView
									node={view.page}
									{reference}
									layout={view.layout}
									{activate}
									{heightDelta}
									{choices}
									{choose}
								/>{/key}{/if}
					</div>
				{:catch error}<LoadingView
						error={error instanceof Error ? error.message : 'Please try again.'}
						onretry={() => loadRevision++}
						oncancel={() => void open('catalog')}
					/>{/await}
				{#if runtime.members.promotionNotice}<div
						class="design-notice"
						role="status"
					>
						{runtime.members.promotionNotice}
					</div>{/if}
				<div
					class="design-motion-host"
					bind:this={motionHost}
					aria-hidden="true"
				></div>
				<div
					class="design-dock"
					inert={!!page.state.modalOrigin}
					class:responses-dock={runtime.forms.formTab === 'Responses' &&
						['forms.questions', 'forms.assignments.team'].includes(id)}
				>
					{#each docks as dock (dock.key)}<NodeView
							node={dock.node}
							{reference}
							root={false}
							layout={dockLayout}
							{activate}
							{heightDelta}
							{choices}
							{choose}
						/>{/each}
				</div>
			</div>
		</div>
	</main>
{:else}
	<main class="design-catalog">
		<h1>Screen unavailable</h1>
		<Button onclick={() => open('catalog')}>Screens</Button>
	</main>
{/if}

{#if pendingTarget}<LoadingView
		label={`Loading ${manifest.find((item) => item.route === pendingTarget)?.name ?? 'page'}`}
	/>{/if}
{#if loadFailure}<LoadingView
		error={loadFailure.message}
		onretry={() => void open(loadFailure!.target)}
		oncancel={() => (loadFailure = undefined)}
	/>{/if}
{#if !newQuestionPage && ['invalid', 'failed'].includes(runtime.submission.status)}<div
		class="design-submission-layer"
	>
		<SubmissionNotice
			submission={runtime.submission}
			onretry={() => retrySubmission?.()}
		/>
	</div>{/if}
