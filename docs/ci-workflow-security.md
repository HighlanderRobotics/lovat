# GitHub Actions workflow security

Use a full upstream commit SHA for external actions and reusable workflows.
Include the corresponding release tag in an inline comment. Repository-local
actions and reusable workflows use paths so they are reviewed with the calling
revision. The Structure job checks these references, the privileged review and
QR jobs, and workflow syntax on every CI run.

Dependabot does not open pull requests for GitHub Actions or application
dependencies. Keep repository vulnerability alerts enabled and triage them
manually. Review pinned workflow dependencies monthly and open focused pull
requests for security fixes or useful updates. Verify that each SHA belongs
to the upstream release in its comment, read the release notes, and review
permission or runtime changes. Update major versions in dedicated PRs, and
run the relevant CI checks before merging. Floating external references have
no exceptions.

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
