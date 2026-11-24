import { readFile, writeFile } from 'node:fs/promises';

// Vitest 3 uses /coverage/index.html; Pages hosts this report below /lovat/website/.
const path = new URL('../test-report/index.html', import.meta.url);
const html = await readFile(path, 'utf8');
if (!html.includes('</head>')) throw new Error('Vitest report has no closing head tag');
const routing = `<script id="lovat-coverage-routing">
const reportBase = new URL('./', window.location.href);
const fixCoverageRoute = () => {
  const frame = document.getElementById('vitest-ui-coverage');
  const path = new URL('coverage/index.html', reportBase).pathname;
  if (frame && frame.getAttribute('src') !== path) frame.setAttribute('src', path);
};
new MutationObserver(fixCoverageRoute).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
</script>`;
if (!html.includes('id="lovat-coverage-routing"'))
	await writeFile(path, html.replace('</head>', `${routing}</head>`));
