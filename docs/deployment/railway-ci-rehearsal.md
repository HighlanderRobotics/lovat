# Rehearse Railway's tested-commit gate

[Deployment guide](README.md) · [Railway IaC and cutover](../../.railway/README.md) · [LVT-336](https://linear.app/highlander-robotics/issue/LVT-336) · [LVT-337](https://linear.app/highlander-robotics/issue/LVT-337)

This is a provider rehearsal, not a production change. GitHub's required `Monorepo CI` check and Railway's **Wait for CI** are separate. Railway evaluates the GitHub Actions workflows associated with a commit, not individual jobs. A cancelled workflow can be ignored when another succeeds. [Railway's autodeploy rules](https://docs.railway.com/deployments/github-autodeploys) describe the other terminal states.

## Isolate and review

1. Use a dedicated, disposable Railway environment and a temporary GitHub branch **after** the environment, resource cost, configuration changes and cleanup are approved. Do not repurpose shared staging or someone else's PR preview. Start with the static Learn image and a generated Railway domain. No production domains, volumes, databases, data, keys, or organization integrations may be inherited. Do not use an environment copied or forked from production. The canary needs no database, migrations, secrets or outbound integrations. A static canary proves the provider gate; it does not prove the five-service IaC cutover.
2. Pin the target project, environment, service IDs, branch and watch paths. Confirm there are no unrelated staged changes. Record the source settings, gate value, ownership and current deployment ID/SHA without exporting variable values. Confirm the branch has a GitHub Actions workflow triggered by pushes to that branch; the production CI push trigger targets `main`, so a PR-only run is not evidence that the exact canary SHA will be gated.
3. Review a redacted plan before applying. For a **full matching five-service** disposable preview that already runs the Worker continuously, use the repo's pinned tooling (Railway CLI ≥5.62.1), link only that environment, inspect `railway config partials list --json`, then run:

   ```sh
   RAILWAY_CONFIG_BRANCH="$REHEARSAL_BRANCH" RAILWAY_WORKER_CRON='' \
     RAILWAY_WAIT_FOR_CI=true railway config plan --json
   ```

   Use a deliberately scoped plan for a one-service canary. **Do not apply the full five-service graph to it.** Only the intended source `checkSuites` change belongs in this rehearsal; separately review any named-partial adoption or Worker reconciliation. Stop on unexpected branch, health, domain, variable, storage or other resource changes. Re-run the plan immediately before any approved apply.

## Capture fail, pass and rollback

| Step | Required observation |
| --- | --- |
| Baseline **A** | After enabling the reviewed gate, record an active healthy deployment and its exact source SHA, ID, and rollback eligibility. Check the static route and marker. |
| Intentional failure **F** | Push a canary-only change that matches the service's watch path and makes an applicable push check fail deterministically. Match the failed GitHub workflow/check suite and Railway attempt to **F**. Railway must mark **F** skipped, with **A** still active and unchanged. A no-op watch-path skip or missing Railway attempt is not evidence. |
| Corrected commit **P** | Fix the failed check with another matching canary change. Verify applicable GitHub workflows pass for **P**, Railway deploys **P** successfully, and a bounded GET returns the expected status and marker. Record any `WAITING` observation, plus final status and deployment ID. Intentionally skipped jobs must not strand **P**. |
| Rollback to **A** | With a retained and eligible baseline, use Railway's isolated rollback. Wait for success, match the restored deployment to **A**, confirm the baseline marker and compare saved settings. Railway rollback can restore old variables with the image; it is not a database restore. If **A** is no longer eligible, stop rather than treating a fresh build as the same rollback. |

A separate `workflow_run` report publisher should not hold production promotion hostage. Do not assume it is outside Railway's gate: for **F** and **P**, compare `workflow_run.head_sha` (the triggering run), the publisher run's own `head_sha` and check-suite association, and the checks listed on the exact candidate SHA in GitHub. Record whether Railway saw the publisher's suite. If the publisher is associated with that SHA, verify in isolation that a publisher-only failure does not block a valid promotion; otherwise resolve the coupling before enabling the provider gate.

Save the GitHub workflow/check URLs and conclusions, Railway deployment IDs/statuses, SHA mapping, redacted plan, and route evidence. Restore the original gate and configuration if the environment is retained; otherwise remove only the approved disposable environment, temporary branch and test resources. Confirm no pending work, resources or recurring jobs remain and no shared environment changed. Review production adoption separately.

## Dec. 1 cutover caveat

Railway documents a **December 1, 2026** cutoff for legacy [Config as Code](https://docs.railway.com/config-as-code). The [Nov. 12 snapshot](../../.railway/evidence/2026-11-12/verification.md) recorded `lovat-apps` ownership in production and staging, not preview adoption; the Nov. 22 control-plane recheck found blank legacy paths on those five services in each environment. A clean historical plan or a merged IaC file does not prove current ownership, environment isolation, preview adoption, Wait for CI enforcement or rollback. Keep those open until the current redacted plan and the rehearsal evidence are recorded.
