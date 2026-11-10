# Learn import

- Source: `https://github.com/MangoSwirl/lovat-learn`, default branch `main`.
- Imported on 2026-09-13 from `f96035ea171553f003c6e968713625630588bcbb`.
- All 63 default-branch commits were rewritten under `apps/learn` with git-filter-repo and merged without squashing. The source has no tags.
- Rewritten head: `5510e372f231dd12fbe4af3a933f1b366cef11e9`.
- Import merge: `70e3d252b5aa41d418f88ae0cdb98dcab03d6b95`.
- Original-to-rewritten revisions: [commit map](commit-maps/learn.txt).
- Imported app tree: `a67c14201671f5fba74fef57a690f362b40766d9`, identical to the rewritten source subtree.

## Integration changes

Application source, assets, configuration, and npm lockfile are unchanged. Replaced the starter README with app-specific instructions and added local agent instructions. Added Learn to root documentation, structure and aggregate checks, path-filtered build CI, the CI gate, and Dependabot. No hosting settings were changed remotely.

## Validation

- Gitleaks source-history scan: no findings.
- `npm ci --no-audit --no-fund`: passed.
- `ASTRO_TELEMETRY_DISABLED=1 npm run build`: passed; 16 static pages and Pagefind search generated, using local Node.js 26.7.0/npm 11.19.0. CI targets Node.js 22; that runtime was not available locally.
- `./scripts/check-structure.sh`, `actionlint`, and `git diff --check` for integration edits: passed. The full imported diff retains upstream trailing whitespace.
- Unrelated app checks were not rerun; their source and dependencies were unchanged.

The source build reports a missing custom 404 content entry and skips sitemap generation because no `site` URL is configured. It also retains the existing `scouting-a-match copy.mdx` guide. These baseline details were preserved during import.
