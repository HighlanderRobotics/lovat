# GitHub Actions workflow security

Use a full upstream commit SHA for external actions and reusable workflows.
Include the corresponding release tag in an inline comment. Repository-local
actions and reusable workflows use paths so they are reviewed with the calling
revision. The Structure job checks these references, the privileged review and
QR jobs, and workflow syntax on every CI run.

Floating external references have no exceptions. For pin updates, verify that
the SHA belongs to the upstream release in its comment, read the release notes,
and review any permission or runtime changes. Keep major upgrades in dedicated
PRs.

## Manual vulnerability triage

Keep automated Dependabot PRs off, including **security update PRs**. Keep
vulnerability alerts and the dependency graph enabled separately. The checked-in
[Dependabot config](../.github/dependabot.yml) uses wildcard ignores and a zero
PR limit for its configured ecosystems; the limit alone does not suppress
security PRs. This file does not prove the live settings or alert delivery.
A repository maintainer with access should verify them in GitHub without
enabling security updates. See [LVT-343](https://linear.app/highlander-robotics/issue/LVT-343).

### Coverage visible in the repository

| Area | Checked in today | Manual check or gap |
| --- | --- | --- |
| npm and Bun | When the [Collection CI job](../.github/workflows/ci.yml) runs, `npm audit --json --audit-level=high` fails it on high/critical findings; the job retains the audit artifact for 14 days. GitHub supports npm manifests and lockfiles in its dependency graph. | No equivalent repo-wide gate is wired for other npm lockfiles or Worker's `bun.lock`. Run an advisory audit from the owning package, using its actual lockfile and normal package manager. Report skipped registries or failed audits instead of calling them clean. |
| Dart and Actions | GitHub recognizes `pubspec.lock` and workflow manifests. CI validates workflow pins and syntax, not third-party action vulnerabilities. | Verify which Dart lockfiles appear in the live graph. GitHub does not generate alerts for SHA-pinned action references; check upstream security advisories and releases for those pins manually. |
| Android Gradle | Dependabot lists Dashboard's Android directory, but no checked-in workflow submits its resolved graph. A native build is not a vulnerability scan. | Check the resolved release dependency graph and upstream advisories for the affected native app; for Gradle alerts, verify a current dependency-graph submission rather than assuming the config entry provides coverage. |
| CocoaPods and containers | Dashboard pins iOS/macOS dependencies in `Podfile.lock`; applications declare base images in Dockerfiles and CI builds selected images. No checked-in advisory scan covers the pods or image OS packages. | Compare resolved pods with vendor advisories. Review upstream base-image advisories and, when approved tooling is available, scan the built runtime image by digest and platform. Record an unscanned platform or image as a gap. |

See GitHub's [dependency graph coverage](https://docs.github.com/en/code-security/reference/supply-chain-security/dependency-graph-supported-package-ecosystems) and [Gradle support](https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories#gradle).
CodeQL is code analysis, not a substitute for dependency or image checks.

### Proposed review cadence and response

1. **Intake.** A repository maintainer reviews new high/critical alerts when
   notified and checks the alert queue weekly. Review upstream advisories for
   SHA-pinned actions, native dependencies, and base images monthly and before
   a release that changes them. These are proposed review intervals, not an SLA.
2. **Triage.** The affected app maintainer (or CI maintainer for Actions and
   release maintainer for base images) confirms the advisory ID, resolved version,
   dependency path, affected release or CI job, reachability, and fixed version.
   Escalate known exploitation or reachable critical findings promptly to the
   release maintainer to decide whether to hold promotion or mitigate. For a
   deferred or non-applicable finding, record the reason, owner, and review date.
3. **Fix and verify.** Open a focused manual PR with the smallest safe upgrade
   or mitigation, review the relevant lock/pin diff, and recheck the original
   advisory against the fixed dependency graph or exact rebuilt image. Run the
   owning app's tests and builds from the [testing guide](testing/README.md),
   including affected native builds or an image smoke test where relevant.
   Check the applicable CI jobs actually ran. In the PR, record what passed and
   what could not be checked. Close the triage item after the fix is merged and,
   if it affected a shipped app or image, verify the fixed release is deployed.

## Privileged workflows

The AI review job skips forks. It checks out the PR base commit, disables
credential persistence, and gives the OpenRouter key only to the reviewer
process. The Railway QR job checks out the default branch with credential
persistence disabled. Its PR trigger accepts same-repository heads, and its
comment trigger accepts the Railway bot and its marker. It reads PR metadata
through the GitHub API. Keep PR or comment content out of shell expressions
and keep write permissions on the job that needs them.

GitHub Pages uses its named deployment environment. Dashboard deployment
provider secrets are scoped to the production job's deploy steps. The
Dashboard production environment and approval policy are tracked under
[LVT-345](https://linear.app/highlander-robotics/issue/LVT-345).
