# Testing and CI

[Developer docs](../README.md) · [Local development](../development/README.md)

## Before opening a PR

Run the repository layout check from the root:

```bash
./scripts/check-structure.sh
```

Run the tests and lint/build checks for the apps you changed. With app dependencies already installed, `./scripts/check-all.sh` runs the repository's aggregate local checks. It is not a dependency installer or a substitute for native, integration, or deployment checks.

If a change touches a report schema, API response, or another shared behavior, run the tests for each affected producer and consumer. See [contract fixtures](fixtures/README.md) for the canonical cross-app test data.

## In GitHub Actions

- [Monorepo CI](../../.github/workflows/ci.yml) selects app and contract jobs using [path filters](../../.github/ci-filters.json). Use the aggregate result to check which applicable jobs passed.
- [Collection native tests](../../.github/workflows/collection-native-tests.yml) and [Dashboard native tests](../../.github/workflows/dashboard-native-tests.yml) cover platform-specific paths.
- [Web hosting image tests](../../.github/workflows/web-hosting.yml) build and run the Dashboard, Website, and Learn production images.
- [CodeQL](../../.github/workflows/codeql.yml) runs static analysis for its selected inputs.

CI publishes artifacts for individual runs. See [test report hosting](../test-report-hosting.md) for the shared Pages site and publishing setup.
