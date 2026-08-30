# Frozen source revisions

- Captured: 2026-08-30 21:27:51 UTC
- Executor: Codex using the repository-local Git identity for commits
- Source: fresh remote mirrors cloned directly from GitHub
- Freeze approved by the user on 2026-08-30

| App | Source | Branch | Approved SHA | Tree SHA | Commits | Tags |
|---|---|---|---|---|---:|---:|
| Server | `HighlanderRobotics/lovat-server` | `main` | `4aa68fd246b01859ad4e0fab3e544167f72f907f` | `90392ed9c2d2eba9f23949949b51c8052beef348` | 1,133 | 0 |
| Dashboard | `HighlanderRobotics/scouting_dashboard_app` | `master` | `79f80d2fb968ee8074714e00757bcc9c60f34a84` | `4343d128f3367730c5f396d4ada7e993a1ff58dc` | 739 | 14 |
| Collection | `HighlanderRobotics/lovat-collection` | `main` | `012e62021f9f65a6fff50fffb284a9c5791e78df` | `de87a554d3939ca32f6b55bbfe5950358c44931b` | 432 | 10 |
| Website | `HighlanderRobotics/lovat-website` | `main` | `0fe6711b262e5f97373d58e8d2d96a091ff2a35c` | `f4ddd2ded8d4c3f0b9b4f7d39979bf828ad35741` | 190 | 0 |

Long-lived deployment heads:

- Server `staging`: `68a47118b8882f78b878eb048018b6f2775aad07`
- Dashboard `production`: `9fbed22d1c6a2e4cc5102d3f05433e19af909878`
- Dashboard `master...production` divergence at freeze: 9 commits on each side

## Local-worktree exclusions

Migration inputs came only from the fresh remote mirrors. The existing Collection worktree had uncommitted changes in `app/home.tsx` and `lib/lovatAPI/getMatchSchedule.ts`; those changes were not read into, copied into, or modified by the migration.

## Import audit

All mirrors passed `git fsck --full`. Gitleaks scanned the histories that will be imported. Collection and Website had no findings. Server and Dashboard findings were reviewed without exposing values and classified as false positives: match identifiers, public Auth0 client identifiers, lockfile metadata, and an empty example variable.

No imported tip contains a Gitlink, signing file, generated dependency directory, build directory, or Git LFS dependency. Historical Server commits contain removed `dist/` output and historical Server and Collection commits contain removed self-referential Gitlinks; these are retained only as part of source history and are absent from the frozen trees.

The tracked Collection `.env.production` contains one key, `EXPO_PUBLIC_API_URL`, and no private key name.

## Migration tools

- Git: `2.45.2`
- git-filter-repo: `a40bce548d2c`
- Gitleaks: `8.30.1`
- actionlint: `1.7.12`

## Rewritten default-branch heads

| App | Rewritten SHA |
|---|---|
| Server | `642572cc141c7c30ebb4f13cd5d94584249159d2` |
| Dashboard | `d1df79005341e06f41568429c31efc3ebc8ea65d` |
| Collection | `128e7089493d70945b7a35d44938ceecc2f57655` |
| Website | `bf14364927f9dac47dadbd0f0ec4d368c40f2893` |

Each rewritten branch retained its original commit count and exposes the recorded original tree at its new `apps/*` path. Tag counts equal the original remote tag count plus the planned archival tags. All rewritten mirrors passed `git fsck --full`; the repeated Gitleaks scan produced the same reviewed findings as the frozen mirrors and no new finding.
