# Changelog

Lovat’s history organized by month, newest first, with related changes grouped
by feature. Entries summarize code changes and fixes across Dashboard,
Collection, Server, Website, and Learn. Merge dates are used for monorepo work;
earlier entries use source commit dates. These are not deployment dates.

The [complete history](docs/history/README.md) provides the supporting record of
all 2,668 commits retained on main and tags, from December 2022 through October
2026. Months without retained commits are omitted.

## Unreleased

Add upcoming changes under the relevant feature heading.

## October 2026

### Scouting and schedules

- Applied source-team visibility rules to individual report reads and isolated cached analysis by viewer. ([#54](https://github.com/HighlanderRobotics/lovat/pull/54), [#55](https://github.com/HighlanderRobotics/lovat/pull/55))
- Removed the duplicate response when returning team rankings. ([#61](https://github.com/HighlanderRobotics/lovat/pull/61))

### Analysis and predictions

- Corrected autonomous-climb scoring to award 15 points and include it in total points. Dashboard raw reports now display explicit fuel and autonomous-path scores. ([#53](https://github.com/HighlanderRobotics/lovat/pull/53))
- Corrected accuracy-adjusted scoring, pooled feeding rates, and match predictions with zero variance. ([#69](https://github.com/HighlanderRobotics/lovat/pull/69))

### Picklists and exports

- Improved missing-picklist responses and included driver ability in picklist responses. ([#69](https://github.com/HighlanderRobotics/lovat/pull/69))

### Accounts and integrations

- Replaced exception objects in API error responses with stable messages, tightened browser-origin validation, and added a shared API rate limit. Slack onboarding now uses one-time OAuth state and validates event challenges. ([#57](https://github.com/HighlanderRobotics/lovat/pull/57))

### Platform and reliability

- Expanded Server behavioral and PostgreSQL/Redis integration tests. CI enforces 100% per-file line, statement, function, and branch coverage for configured Server source files. ([#69](https://github.com/HighlanderRobotics/lovat/pull/69))
- Added static test results and coverage reports, downloadable CI artifacts, optional GitHub Pages publishing, and README status badges. See [publishing setup](docs/test-report-hosting.md). ([#76](https://github.com/HighlanderRobotics/lovat/pull/76), [#70](https://github.com/HighlanderRobotics/lovat/pull/70))
- Added PostgreSQL tests for report transactions and migration replay. ([#56](https://github.com/HighlanderRobotics/lovat/pull/56))
- Local Server development can skip initial and scheduled Blue Alliance imports when `TBA_KEY` is empty; direct Blue Alliance routes still need the key. ([#60](https://github.com/HighlanderRobotics/lovat/pull/60))
- Updated Server, Website, and Learn dependencies, including Zod and Astro/Sharp security fixes. Removed CODEOWNERS. ([#57](https://github.com/HighlanderRobotics/lovat/pull/57), [#58](https://github.com/HighlanderRobotics/lovat/pull/58), [#59](https://github.com/HighlanderRobotics/lovat/pull/59))

[Complete changes for October 2026](docs/history/2026.md#2026-10).

## September 2026

### Analysis and predictions

- Dashboard breakdown details now wrap long labels and truncate oversized titles to prevent overflow. ([#39](https://github.com/HighlanderRobotics/lovat/pull/39))

### Website and guides

- Imported Lovat Learn and its existing guide history into `apps/learn`. ([#26](https://github.com/HighlanderRobotics/lovat/pull/26))

### Platform and reliability

- Introduced the shared Prisma 7 database package, retaining migrations and generated types. Synced upstream Server changes, including `/version` and cross-platform development scripts. ([#16](https://github.com/HighlanderRobotics/lovat/pull/16))
- Added Railway hosting configurations, Docker images, configurable URLs, and smoke checks for Learn, Dashboard, and Website. See [hosting setup](docs/railway-web-hosting.md). ([#36](https://github.com/HighlanderRobotics/lovat/pull/36))
- Moved Server deployment configuration into `apps/server` while retaining the repository root as its Docker build context. ([#38](https://github.com/HighlanderRobotics/lovat/pull/38))
- Added the initial Server behavioral and integration suite, CodeQL analysis, and independent application CI checks. CodeQL skips non-code changes; Dependabot supplies security updates only. ([#50](https://github.com/HighlanderRobotics/lovat/pull/50), [#43](https://github.com/HighlanderRobotics/lovat/pull/43), [#46](https://github.com/HighlanderRobotics/lovat/pull/46))
- Clarified contributor commit and PR guidance and required new task branches to start from updated `main`. ([#40](https://github.com/HighlanderRobotics/lovat/pull/40), [#49](https://github.com/HighlanderRobotics/lovat/pull/49))

[Complete changes for September 2026](docs/history/2026.md#2026-09).

## August 2026

### Accounts and integrations

- Removed a duplicate authentication middleware call that caused API keys to be rate-limited twice. ([e10a2953](https://github.com/HighlanderRobotics/lovat/commit/e10a2953e5f73bb1062d2cea2a8113e515f256e3))

### Platform and reliability

- Combined Server, Dashboard, Collection, and Website in one repository while preserving imported histories and namespaced tags. Applications retain independent dependencies and build commands. See [migration records](docs/migration). ([5743f4c7](https://github.com/HighlanderRobotics/lovat/commit/5743f4c747e2e08ffa2dae452be646046e1b511e))
- Added architecture documentation, application instructions, structure checks, consolidated CI, a Dashboard deployment workflow, and project-scoped Linear MCP configuration. ([f11a1e3f](https://github.com/HighlanderRobotics/lovat/commit/f11a1e3f898aea779055901da582e65d27118901), [3106cc0f](https://github.com/HighlanderRobotics/lovat/commit/3106cc0f512f23d7614768fd80ce7de419396ec8), [94479a37](https://github.com/HighlanderRobotics/lovat/commit/94479a3787013f7faeb49059f26beed3611938a4), [369c3522](https://github.com/HighlanderRobotics/lovat/commit/369c3522943a7e2eb6f3e01974470f54ec91c45a))

[Complete changes for August 2026](docs/history/2026.md#2026-08).

## July 2026

### Scouting and schedules

- Collection only reports scores-while-moving when a shooting or feeding event exists. Server added a match-existence endpoint. ([1c1ac75f](https://github.com/HighlanderRobotics/lovat/commit/1c1ac75f13c755355116e1a1f2aacbb1ba0e05ac), [1965e7df](https://github.com/HighlanderRobotics/lovat/commit/1965e7df26c8a86e1f7687d19004e9de5a1b5f93))

### Picklists and exports

- Fixed Dashboard picklist flag invalidation. ([d1df7900](https://github.com/HighlanderRobotics/lovat/commit/d1df79005341e06f41568429c31efc3ebc8ea65d))

### Platform and reliability

- Improved Dashboard API-query caching, data fetching, and error handling. ([e41bef5f](https://github.com/HighlanderRobotics/lovat/commit/e41bef5f8e2b8b90addfcff7a5fcde008bf0c71c), [2271b5c1](https://github.com/HighlanderRobotics/lovat/commit/2271b5c19e954431a5ede844f1653e46832ce15c))

[Complete changes for July 2026](docs/history/2026.md#2026-07).

## June 2026

### Scouting and schedules

- Added tournament participation flags and placed tournaments involving the current team first in Dashboard. ([05239bc3](https://github.com/HighlanderRobotics/lovat/commit/05239bc309a216815db156db13dbb9edfdcca952), [8db01806](https://github.com/HighlanderRobotics/lovat/commit/8db01806232fa5e2824eae4410297aaf03ee2784))
- Added support for a four-team double-elimination bracket. ([7166ab11](https://github.com/HighlanderRobotics/lovat/commit/7166ab11bc7fe37898edb71f0dc58da674f02dac))

### Analysis and predictions

- Cleaned up team autonomous-path details and shortened match names in the path viewer. ([e980d8a3](https://github.com/HighlanderRobotics/lovat/commit/e980d8a3d1c3eb4f391687d8232a33be56aa411e), [86a15852](https://github.com/HighlanderRobotics/lovat/commit/86a1585285ff106c3194af164e6a0e12c7173081))

### Website and guides

- Removed disabled mailing-list signup controls and updated the public video link. ([9276fc35](https://github.com/HighlanderRobotics/lovat/commit/9276fc358338ccf0f991c0870871c4ef57233695), [bf143649](https://github.com/HighlanderRobotics/lovat/commit/bf14364927f9dac47dadbd0f0ec4d368c40f2893), [71382a53](https://github.com/HighlanderRobotics/lovat/commit/71382a53c6bdd10ca7a71232684f049de20a4803))

### Platform and reliability

- Added API response compression, staging CPU/memory limits, and QR-code generation for Railway PR deployments. Improved Dashboard API-call type safety. ([6e5c17b0](https://github.com/HighlanderRobotics/lovat/commit/6e5c17b0d5f7820d3a7d9866e936fbcb085fc790), [0395f4f9](https://github.com/HighlanderRobotics/lovat/commit/0395f4f91f8d36a849927ca2bf2c4502d120a5fe), [9ffc2f3e](https://github.com/HighlanderRobotics/lovat/commit/9ffc2f3ee35da2fa6f83a17549e223df668e75c1), [89466efe](https://github.com/HighlanderRobotics/lovat/commit/89466efe75eb664d67c0a080177d69e3808ee5c2))

[Complete changes for June 2026](docs/history/2026.md#2026-06).

## April 2026

### Scouting and schedules

- Removed the authentication requirement from the shift generator. ([7b4c5080](https://github.com/HighlanderRobotics/lovat/commit/7b4c508087c44b75f1119268d94f54071e3c8fe5))

### Analysis and predictions

- Aligned accuracy multipliers between analysis processors and updated the ranking-point threshold. ([cb99d9c3](https://github.com/HighlanderRobotics/lovat/commit/cb99d9c365c85cd6456e734ae990a64b8c4e2359), [581b4463](https://github.com/HighlanderRobotics/lovat/commit/581b4463e9e5edc93cac69ac100bb8963299bac9))
- Improved Dashboard driver-ability and defense-effectiveness labels. ([08cccd7c](https://github.com/HighlanderRobotics/lovat/commit/08cccd7ca67108b81033a3b01813cede066c4f5f))

[Complete changes for April 2026](docs/history/2026.md#2026-04).

## March 2026

### Scouting and schedules

- Collection migrated orphaned start events and corrected undo behavior and missing stop events. Server added matching sanitization and fixed responses for invalid events. ([86f89539](https://github.com/HighlanderRobotics/lovat/commit/86f89539a2af40ccd27439fc1ad0b20c02ff391e), [7bccfd03](https://github.com/HighlanderRobotics/lovat/commit/7bccfd03ea5996fa19333b7a25c3baa1eb364928), [56514a89](https://github.com/HighlanderRobotics/lovat/commit/56514a89678aa57c92cd98321cd3ed1ea9591141), [446753c4](https://github.com/HighlanderRobotics/lovat/commit/446753c41fc0e6bb3c9c4b94ab4a2fc2c004cc75), [89230125](https://github.com/HighlanderRobotics/lovat/commit/892301250bf9e22844cdffce4100287ef326d38d))
- Fixed scouter names being exposed to other teams, allowed users beyond scouting leads to view raw data, and hid Dashboard editing controls when reports cannot be edited. ([0c8a8a57](https://github.com/HighlanderRobotics/lovat/commit/0c8a8a57362232dad066d10f49d6788999ad7b7c), [6eef6a54](https://github.com/HighlanderRobotics/lovat/commit/6eef6a54f1014bf36973608427ea6ccc09770115), [35fe4f8b](https://github.com/HighlanderRobotics/lovat/commit/35fe4f8b0a13a0f8f7b24a1156df3e1e28dad34a), [b3b47065](https://github.com/HighlanderRobotics/lovat/commit/b3b4706550b108ccf8e27e647649ddf2549d559f))
- Added scouter-shift routes. ([15783d40](https://github.com/HighlanderRobotics/lovat/commit/15783d4022157e2448439984446204f5754ac8e8))

### Analysis and predictions

- Fixed Dashboard accuracy handling and stopped caching rank flags. ([5366d89a](https://github.com/HighlanderRobotics/lovat/commit/5366d89a12c06ccca84e56ea1b8d4c99ef8ad7f8), [3dfce937](https://github.com/HighlanderRobotics/lovat/commit/3dfce937d72403cff521ea420c26c8830b4c81b9))

### Picklists and exports

- Fixed web CSV export and updated team exports to use teams from Blue Alliance. ([ed92f39c](https://github.com/HighlanderRobotics/lovat/commit/ed92f39c45d67d3c3ddeb1c90f0199238936090d), [0128ea35](https://github.com/HighlanderRobotics/lovat/commit/0128ea3519a01aee8683807cba342402dcf432fe))

### Platform and reliability

- Collection requests now include device IDs and additional app information; corrected request analytics logging. ([74654594](https://github.com/HighlanderRobotics/lovat/commit/7465459487ecb18764d85d23e049f10b9fa8a284), [af54ae3f](https://github.com/HighlanderRobotics/lovat/commit/af54ae3f975080a237a274c294c5171253b28faf), [dcc0a0d0](https://github.com/HighlanderRobotics/lovat/commit/dcc0a0d0aac36dd9a87f6bb75a006dbc07bb0d9d))

[Complete changes for March 2026](docs/history/2026.md#2026-03).

## February 2026

### Scouting and schedules

- Added scoring/feeding validation, minimum durations for camping and defense, traversal-direction arrows, and an explicit start-match event in Collection reports. ([41d80c4b](https://github.com/HighlanderRobotics/lovat/commit/41d80c4b1261a721c0be0746a5f224c4da9566ee), [1bdd0f87](https://github.com/HighlanderRobotics/lovat/commit/1bdd0f879f5b59406c1feea8136f614e6d007f58), [27d8b87b](https://github.com/HighlanderRobotics/lovat/commit/27d8b87b3c53b9afac33b7bf3a35a4fb197439f0), [ef03f417](https://github.com/HighlanderRobotics/lovat/commit/ef03f417fd649c2d0d5ef0fdcd39ac061f7f9a80))
- Replaced the broken QR-report swiper with FlatList and corrected the notes-box scroll behavior. ([a1cedb7a](https://github.com/HighlanderRobotics/lovat/commit/a1cedb7a70b2e7e7e737571d4b23bbb8682c3e91), [4231e370](https://github.com/HighlanderRobotics/lovat/commit/4231e370d93e126497f93deb605ac790b091a3c2))

### Analysis and predictions

- Added disruption events to the autonomous-path visualizer, updated robot-break warnings, and corrected climb times in match predictions. ([714ba04c](https://github.com/HighlanderRobotics/lovat/commit/714ba04ca05c7cf02c807bca69c19913e555dc50), [eceb7363](https://github.com/HighlanderRobotics/lovat/commit/eceb736312bc0b497293dda4a6b3e676b7a0971b))

### Accounts and integrations

- Added Dashboard team-email editing and Server checks for verified teams, API-key restrictions on sensitive endpoints, and scouting-report validation. ([380fad10](https://github.com/HighlanderRobotics/lovat/commit/380fad108234e82ad37f85b0d8e5acc9866dd89f), [66f8054a](https://github.com/HighlanderRobotics/lovat/commit/66f8054a90bb4d4673eb425823872afe91c1e20a), [da551e40](https://github.com/HighlanderRobotics/lovat/commit/da551e406edcc355bea6ac86ac92e909dd8578a9), [9e857246](https://github.com/HighlanderRobotics/lovat/commit/9e8572468342770aa84df88aebd82ccba17ef215))

### Website and guides

- Updated the public site for the 2026 launch, added a get-started page, and revised scouting, alliance, and picklist guides with a video embed. ([5d22f750](https://github.com/HighlanderRobotics/lovat/commit/5d22f7503803837bfb291613b927dde0d3a07d7c), [574b184a](https://github.com/HighlanderRobotics/lovat/commit/574b184a25943c058fb251bcece1199484f52de7), [cc3ec1cb](https://github.com/HighlanderRobotics/lovat/commit/cc3ec1cbb548195e72254924cf7ad808a44b9294), [c1359423](https://github.com/HighlanderRobotics/lovat/commit/c13594230cd67f8275fbedcf381fb59daba668e5), [c531d13b](https://github.com/HighlanderRobotics/lovat/commit/c531d13bf9101a74508cf517e3f015919c00a523))

[Complete changes for February 2026](docs/history/2026.md#2026-02).

## January 2026

### Scouting and schedules

- Added the 2026 pre-match screen, draggable field elements, traversal actions, and autonomous climbing to Collection. Fixed repeated simultaneous press events. ([d6d565c7](https://github.com/HighlanderRobotics/lovat/commit/d6d565c792514938a1a65768818fcf7410ce1edd), [4a566700](https://github.com/HighlanderRobotics/lovat/commit/4a566700b1338724241806a5220ab948a5756920), [8adeb83f](https://github.com/HighlanderRobotics/lovat/commit/8adeb83f78aa3ce2e251f5fe7052b4b18ec3b59d), [8bacfd33](https://github.com/HighlanderRobotics/lovat/commit/8bacfd3386a2b7659947ec40c9dd2d56d708402a), [4867be7b](https://github.com/HighlanderRobotics/lovat/commit/4867be7b847a07d9713b13d7e0a9d592d47e5ed1))
- Added a Server route to fetch a tournament’s scouter shifts. ([ca084312](https://github.com/HighlanderRobotics/lovat/commit/ca08431221bfb72ff240009ca8e1b6abf1be51c2))

### Analysis and predictions

- Corrected autonomous-path event ordering. ([43618df5](https://github.com/HighlanderRobotics/lovat/commit/43618df5dfdec2cf5340c63ba630896e78edc0f8))

### Accounts and integrations

- Fixed native Dashboard Auth0 authentication and Slack notification behavior; refactored manager and Slack endpoints. ([58d1d3fa](https://github.com/HighlanderRobotics/lovat/commit/58d1d3fa50756cac05e9ff619435f0ddd9757b57), [6d4055b8](https://github.com/HighlanderRobotics/lovat/commit/6d4055b8754a4e3c5ea4994ffc5004ec6fd4a2a5), [91602de5](https://github.com/HighlanderRobotics/lovat/commit/91602de52c34add72da94a0a57f1d8c61f597745))

### Website and guides

- Updated the public banner and release messaging for 2026. ([485b82a4](https://github.com/HighlanderRobotics/lovat/commit/485b82a44361f06dacf6c43646752c8dcf413d1a), [2312c74f](https://github.com/HighlanderRobotics/lovat/commit/2312c74fc6d218ad4956b3bcdacb50977d3ca333))

### Platform and reliability

- Added Dashboard APK builds and GitHub releases to production deployment, introduced version checks, and included app version/platform in analytics. ([1ad80c9a](https://github.com/HighlanderRobotics/lovat/commit/1ad80c9aa097d6b82af5dbcdf5cfd798d7171298), [b7c8bebc](https://github.com/HighlanderRobotics/lovat/commit/b7c8bebc80f9d5ddb0d71b2d06a4a1c636111b20), [d5aeb034](https://github.com/HighlanderRobotics/lovat/commit/d5aeb034f0a280af81102bf6a5244f53ad426cd3))

[Complete changes for January 2026](docs/history/2026.md#2026-01).

## December 2025

### Scouting and schedules

- Added filtering to the scouter-list endpoint and corrected scouter-archiving behavior. ([9ebd79a1](https://github.com/HighlanderRobotics/lovat/commit/9ebd79a123d14c4ac210d58fd348905576de6588), [5b22197f](https://github.com/HighlanderRobotics/lovat/commit/5b22197f748a3dae11b3a12438b04ed15fc175ce))

### Platform and reliability

- Started Dashboard web implementation and moved shared dependency code into Dashboard. ([4df49936](https://github.com/HighlanderRobotics/lovat/commit/4df49936f0822139c300af1ed0e77242b2869e04), [37e8fccf](https://github.com/HighlanderRobotics/lovat/commit/37e8fccf0aab5e28876465dae3695d59e0673258))
- Reset caches at Server startup, added cache logging, and corrected staging instance configuration. ([93c4e614](https://github.com/HighlanderRobotics/lovat/commit/93c4e614def6367ec45af18734339107c43502dd), [2ff258e4](https://github.com/HighlanderRobotics/lovat/commit/2ff258e4b0bbed2aa0173b32219004aea19d6284), [7f8747ab](https://github.com/HighlanderRobotics/lovat/commit/7f8747ab3f4ed630f37f5117cb2570761120651a))

[Complete changes for December 2025](docs/history/2025.md#2025-12).

## November 2025

### Scouting and schedules

- Corrected Collection’s missing-match error, added parameters to scouter endpoints, and hid missed-match counts when no tournament is selected. ([ce4245dd](https://github.com/HighlanderRobotics/lovat/commit/ce4245dd1fe7d44c68634e73cb4be9889b7055a4), [f879e9c2](https://github.com/HighlanderRobotics/lovat/commit/f879e9c254878f1286b97ac929ad2ddaec35b53e), [8313b543](https://github.com/HighlanderRobotics/lovat/commit/8313b543905f1b429807d9d410148da756ad0acd))

### Analysis and predictions

- Debounced Dashboard team-lookup input. ([50f5c201](https://github.com/HighlanderRobotics/lovat/commit/50f5c20160185dfc137223b81de9bacaa3bb6d5c))

### Accounts and integrations

- Continued work on Slack onboarding and introduced source-rule handling. ([e09c6998](https://github.com/HighlanderRobotics/lovat/commit/e09c6998b004dd7f7ed0f39a81cab94dd68e6a49), [7416a13c](https://github.com/HighlanderRobotics/lovat/commit/7416a13c8c62d3cf4a26bf206488534c2bbbeffb))

### Platform and reliability

- Added cache deletion and clearing, corrected cache-key generation, and unified cache invalidation. ([a245dcd1](https://github.com/HighlanderRobotics/lovat/commit/a245dcd1cb8de03161f076bc150beed3caf9411b), [dd920024](https://github.com/HighlanderRobotics/lovat/commit/dd92002420a5e3f40d0861aa761cf3c623d57577), [31a11f55](https://github.com/HighlanderRobotics/lovat/commit/31a11f555bb7144e852e0d922e0921560bbed1fa))

[Complete changes for November 2025](docs/history/2025.md#2025-11).

## October 2025

### Scouting and schedules

- Added scouter archiving/unarchiving and Dashboard scouter search and empty states. Corrected playoff match imports. ([b0054874](https://github.com/HighlanderRobotics/lovat/commit/b00548749cc939be1098a436ac606fd90ed1938d), [0436f6e6](https://github.com/HighlanderRobotics/lovat/commit/0436f6e6c53dc43cba4fc1d397b9360394c60d05), [d0440a0e](https://github.com/HighlanderRobotics/lovat/commit/d0440a0e28491594d6cc56e5939cb2167c7b8160), [70babcd5](https://github.com/HighlanderRobotics/lovat/commit/70babcd5f113b13bd6258dee142874d8696e112a))

### Accounts and integrations

- Added API-key listing and rate limiting and Slack request verification. ([166e14db](https://github.com/HighlanderRobotics/lovat/commit/166e14dbb7a75b30c2b5cdeb960ccf2c43f44675), [3e544467](https://github.com/HighlanderRobotics/lovat/commit/3e54446767587f8690d94b552eb9d9ec884dd16b), [c9d6ccd3](https://github.com/HighlanderRobotics/lovat/commit/c9d6ccd3d3490651cce987156e9e8b5b0c86e806))
- Fixed email verification, added cleanup of expired verification requests, and added expired-code handling to the Website. ([3e6d2a68](https://github.com/HighlanderRobotics/lovat/commit/3e6d2a68b96427b33b246f54eae0f59593d57cec), [dd6df2ac](https://github.com/HighlanderRobotics/lovat/commit/dd6df2ac8ffea8d38d9ab08067332717829e87f8))

### Platform and reliability

- Expanded request data captured by PostHog middleware. ([f6e3dbbc](https://github.com/HighlanderRobotics/lovat/commit/f6e3dbbc14832148944a51ac31ede1f822849896))

[Complete changes for October 2025](docs/history/2025.md#2025-10).

## September 2025

### Scouting and schedules

- Added post-match robot-break observations, stored break descriptions, and displayed them in Dashboard raw reports. ([8156d246](https://github.com/HighlanderRobotics/lovat/commit/8156d2461338d88393ef8bb16cf8ff5a0122430f), [3a6e8f3d](https://github.com/HighlanderRobotics/lovat/commit/3a6e8f3daf0d2df4f0d13cb2ef23721fc1fddc96), [a91d467e](https://github.com/HighlanderRobotics/lovat/commit/a91d467e3d5c89550ffaa57d41ef8817be061d6b), [fe0c4715](https://github.com/HighlanderRobotics/lovat/commit/fe0c4715c1e986b6ffb929adf2ea6990ebfebb64), [56fab183](https://github.com/HighlanderRobotics/lovat/commit/56fab1832666a32c225ead99bfa319e4abadb839))

### Analysis and predictions

- Corrected driver ability in raw reports. ([3f202abc](https://github.com/HighlanderRobotics/lovat/commit/3f202abcf758ea7ed574d8f53cd8dd74a3e146da))

### Accounts and integrations

- Added Slack workspace storage and an OAuth onboarding flow. ([b7851c6b](https://github.com/HighlanderRobotics/lovat/commit/b7851c6b21fbd5a3290c7d0297a81fe3b26eee82), [fe86b287](https://github.com/HighlanderRobotics/lovat/commit/fe86b287a853623d9b8e382c5c716de91e3c1e82))

### Platform and reliability

- Updated Dashboard Android target SDK, Gradle configuration, and build settings. ([b2b45e63](https://github.com/HighlanderRobotics/lovat/commit/b2b45e635e8b4afa5a112f3b097dd593e28b9d99), [65d9ccff](https://github.com/HighlanderRobotics/lovat/commit/65d9ccffaa3ab7cab793f52e7625b2704d2f1f4f), [333523fb](https://github.com/HighlanderRobotics/lovat/commit/333523fbc441f06c85ab895d5df51751807a5e14))

[Complete changes for September 2025](docs/history/2025.md#2025-09).

## August 2025

### Scouting and schedules

- Expanded tournament status with total-match counts and team-specific ranking work. Improved Collection service indicators and tournament selection controls. ([08457661](https://github.com/HighlanderRobotics/lovat/commit/084576612f38a28dc8722679b0f2287f7286e3d8), [23bca4fa](https://github.com/HighlanderRobotics/lovat/commit/23bca4fa127838cf818dd6fdbcd8f8549e26bd45), [a07ea9c5](https://github.com/HighlanderRobotics/lovat/commit/a07ea9c501678e5754ae0859a8bc4ed344466cf6), [dc28df12](https://github.com/HighlanderRobotics/lovat/commit/dc28df12636cebf9c6c52b676fcd361db6628366))

### Accounts and integrations

- Auto-capitalized Collection team-code input and required numeric team numbers on the Website. ([ec665ff2](https://github.com/HighlanderRobotics/lovat/commit/ec665ff27cdb75a19be3aba1126c85e9e2e21861), [a7356fc2](https://github.com/HighlanderRobotics/lovat/commit/a7356fc2910742ff14d7db26bfc074811edaf7f5))

### Platform and reliability

- Removed Collection’s self-referential submodule. ([46362938](https://github.com/HighlanderRobotics/lovat/commit/46362938a012c772cf3446145ea3c1596f4abbe4))

[Complete changes for August 2025](docs/history/2025.md#2025-08).

## July 2025

### Picklists and exports

- Added an error for picklists whose weights are all zero. ([b5ddd1ea](https://github.com/HighlanderRobotics/lovat/commit/b5ddd1eaa9f5deba48dde21c0863eb01b992a802))

### Platform and reliability

- Removed a Server submodule. ([b374e729](https://github.com/HighlanderRobotics/lovat/commit/b374e729e3ee16becf7299572e28ce3bfbe91039))

[Complete changes for July 2025](docs/history/2025.md#2025-07).

## June 2025

### Scouting and schedules

- Added the team-rankings endpoint. ([91d4dc38](https://github.com/HighlanderRobotics/lovat/commit/91d4dc387c445f9e6249485f03dc40123d214392))

### Platform and reliability

- Removed Server’s self-referential submodule. ([148c42e7](https://github.com/HighlanderRobotics/lovat/commit/148c42e75af510fc92faf0a7cff49a858a4641f8))

[Complete changes for June 2025](docs/history/2025.md#2025-06).

## April 2025

### Scouting and schedules

- Collection marks already-uploaded matches as uploaded and fixes processor/coral-scoring button overlap. ([f5313859](https://github.com/HighlanderRobotics/lovat/commit/f5313859085b8ffd5492744f0649b1017e85d28c), [85ee9f1d](https://github.com/HighlanderRobotics/lovat/commit/85ee9f1dc63720a53cafc3f3ad439c4d85d43a17))

### Analysis and predictions

- Added breakdown timelines, corrected aggregation edge cases and autonomous-leave details, and added total-coral category metrics. ([ac8a3223](https://github.com/HighlanderRobotics/lovat/commit/ac8a3223e04abe617f99eda7c8ce05af93f1c83d), [c692c308](https://github.com/HighlanderRobotics/lovat/commit/c692c308b139ad4b46cd9cd176d888725c52c1c5), [3d81ef3b](https://github.com/HighlanderRobotics/lovat/commit/3d81ef3bef3cf0659cba4328cb3b027ffefaf81a), [1572cac6](https://github.com/HighlanderRobotics/lovat/commit/1572cac694f61194fb73c047dd4df2adaba5349d), [11e14aa0](https://github.com/HighlanderRobotics/lovat/commit/11e14aa05fbc2fa69c1640f5888adf6faf9d68cd))

### Picklists and exports

- Added the total-coral picklist metric and fixed reloading after edits. ([25ba35f6](https://github.com/HighlanderRobotics/lovat/commit/25ba35f6460d0780389e55dce4747c86197eebcb), [8b32e242](https://github.com/HighlanderRobotics/lovat/commit/8b32e2427fc868bee3e2b4145cb5690fb7de530f))

### Website and guides

- Updated the scouting-a-match guide and public statistics. ([cbd6a677](https://github.com/HighlanderRobotics/lovat/commit/cbd6a677a6c69a433086a3f438c9edfc40740b51), [0769c883](https://github.com/HighlanderRobotics/lovat/commit/0769c883ba5aa3455947f329b90d1213ced8ca1f))

[Complete changes for April 2025](docs/history/2025.md#2025-04).

## March 2025

### Scouting and schedules

- Reduced match-submission data loss in Collection, fixed Dashboard Android deep links, and clarified when match schedules have not been posted. ([10db88fc](https://github.com/HighlanderRobotics/lovat/commit/10db88fc720b67e79af7b38d5ea8d80a9fbefe0a), [c83d3b9f](https://github.com/HighlanderRobotics/lovat/commit/c83d3b9fb78afaf94253f66793f4080b9faa5f5c), [e6247ed7](https://github.com/HighlanderRobotics/lovat/commit/e6247ed703891dc8430d01b10e4c84fced23a8f2))

### Picklists and exports

- Added picklist CSV export and autonomous/teleop export filtering. Corrected mutable-picklist ranking flags and defense weighting. ([c9690dda](https://github.com/HighlanderRobotics/lovat/commit/c9690dda69451a529c2808bc9f4b898bb8da22c0), [b8e3d49c](https://github.com/HighlanderRobotics/lovat/commit/b8e3d49c66a85d52ad904d1bab6536a677a1c230), [784b403e](https://github.com/HighlanderRobotics/lovat/commit/784b403ef4014ec0eb15a353827c5c5dc53abe0c), [ceb2cd71](https://github.com/HighlanderRobotics/lovat/commit/ceb2cd7189e80802fa807e6ee7485f8697cb1dad))

### Accounts and integrations

- Added onboarding controls and an endpoint to email the team code. ([f8b6487b](https://github.com/HighlanderRobotics/lovat/commit/f8b6487b5bf13becc70a1ba9ae3d7ae838b5c0c3), [02be52ae](https://github.com/HighlanderRobotics/lovat/commit/02be52aeaf961897783ef10dac773a5d3c757a54))

### Website and guides

- Clarified the exporting-data guide. ([669700b2](https://github.com/HighlanderRobotics/lovat/commit/669700b2ceee8d23396a6e54424a8000c70375e6))

[Complete changes for March 2025](docs/history/2025.md#2025-03).

## February 2025

### Scouting and schedules

- Corrected Collection position mapping, ground-piece overlays, and coral/algae pickup layout. Fixed upcoming/finished match filtering in Dashboard and Server. ([579ef759](https://github.com/HighlanderRobotics/lovat/commit/579ef759de4c4c6c3a4437a3a838901fa5b943f3), [24f0d108](https://github.com/HighlanderRobotics/lovat/commit/24f0d1089e38369ef57595dfa8d036f1eeda9e27), [f9696f13](https://github.com/HighlanderRobotics/lovat/commit/f9696f1303a046a573cf2920e47998f02a37d334), [0f8bf0c2](https://github.com/HighlanderRobotics/lovat/commit/0f8bf0c25395730a299e11ef71d21fa60d5e157a), [0690d42b](https://github.com/HighlanderRobotics/lovat/commit/0690d42b56d4ed978b2944f17cb8d69d964a85f3))

### Analysis and predictions

- Started 2025 autonomous-path visualization, added variation to reef locations, and added net-algae category metrics. ([5a14add7](https://github.com/HighlanderRobotics/lovat/commit/5a14add71f54dec8b319ed60c09fd1160a705b03), [7b74fefd](https://github.com/HighlanderRobotics/lovat/commit/7b74fefd15a67e84915432fa1fd244fd9022be8b), [ee91e0c1](https://github.com/HighlanderRobotics/lovat/commit/ee91e0c144be2db7322756f924b7d7c524e4d67f))

### Picklists and exports

- Added algae and defense picklist metrics, autonomous/teleop splits in CSV exports, and corrections to match counts. ([f58331eb](https://github.com/HighlanderRobotics/lovat/commit/f58331ebc7aa181141eca00f99430b9aa6ef6db9), [da0e7358](https://github.com/HighlanderRobotics/lovat/commit/da0e7358b297be29a441f920a0e3c0d2199c910e), [ba9b8854](https://github.com/HighlanderRobotics/lovat/commit/ba9b8854cf7160671fb87bc684069bf8f0c4594b), [53d0f2e0](https://github.com/HighlanderRobotics/lovat/commit/53d0f2e043b99507e39f17824c1be2c8d3b87a50))

### Website and guides

- Added Learn guide articles and images, refined navigation styling, and redirected older Website guide pages to the new guides. ([e270210f](https://github.com/HighlanderRobotics/lovat/commit/e270210f8960757d34d317b638788ad3448c9cf2), [7b592c8c](https://github.com/HighlanderRobotics/lovat/commit/7b592c8c133b370773ca30fb99cce18c26b09492), [20867822](https://github.com/HighlanderRobotics/lovat/commit/20867822e98d2af1d16758145e8f15591b8e2008), [4d4c568a](https://github.com/HighlanderRobotics/lovat/commit/4d4c568a3194080163360f075ee8a700bc8c9699))

### Platform and reliability

- Added caching for the full team-number list. ([08ef352b](https://github.com/HighlanderRobotics/lovat/commit/08ef352b82677038f509e0dfd80d15b841ac7e1d))

[Complete changes for February 2025](docs/history/2025.md#2025-02).

## January 2025

### Scouting and schedules

- Collection introduced coral/algae pickup descriptions and match-event enums for the 2025 game. Fixed action positioning and overlapping-action behavior. ([bc4a6a76](https://github.com/HighlanderRobotics/lovat/commit/bc4a6a76d7bf411dfb09569743c82528f0c04a62), [8f4559fa](https://github.com/HighlanderRobotics/lovat/commit/8f4559fa29861af74ed81de98694299607c69401), [1d4dabb5](https://github.com/HighlanderRobotics/lovat/commit/1d4dabb5d17cb137ca947ca56662156d7fd06e38), [06c8d894](https://github.com/HighlanderRobotics/lovat/commit/06c8d894739bbb6b82c5b767ae5825a62425c1be))

### Analysis and predictions

- Introduced the 2025 schema and Dashboard breakdown/category metrics. ([a6e17d87](https://github.com/HighlanderRobotics/lovat/commit/a6e17d870df459b1944f30627f3083194b3a73d0), [71b2e626](https://github.com/HighlanderRobotics/lovat/commit/71b2e626b7fd7e0e2227baecda1e3223935d67cd), [2df18d98](https://github.com/HighlanderRobotics/lovat/commit/2df18d9884b6bb0c723859d7ccec1c7ef1685841))

### Picklists and exports

- Added 2025 picklist weights and reworked report, team-match, and team CSV generation. ([53e14cc3](https://github.com/HighlanderRobotics/lovat/commit/53e14cc3ff057faabffefdd9a1c66b45125210cf), [cf6ac81a](https://github.com/HighlanderRobotics/lovat/commit/cf6ac81a26d682ea62249acd5c8ed2d431a5d86a), [d3f95b2f](https://github.com/HighlanderRobotics/lovat/commit/d3f95b2fcda9537e50e6d7327848e6852922b395), [d1fc7544](https://github.com/HighlanderRobotics/lovat/commit/d1fc7544d96b6ac8751501f826020a590718ff0c))

### Accounts and integrations

- Updated server-authority QR-code handling and improved the Website contact-form bot trap. ([540dea45](https://github.com/HighlanderRobotics/lovat/commit/540dea456cee693237c89bb02187fc5fc7cab253), [175984c8](https://github.com/HighlanderRobotics/lovat/commit/175984c8651d35333489bda90b3bcae0582ed5f7))

### Website and guides

- Started the Astro-based Learn project and published 2025 release information on the Website. ([1178bbe7](https://github.com/HighlanderRobotics/lovat/commit/1178bbe7f0615f55b1e9e03d25cf148fc4375ec7), [1dc7effd](https://github.com/HighlanderRobotics/lovat/commit/1dc7effd59ac1322fb102f890185f83721067bf8))

[Complete changes for January 2025](docs/history/2025.md#2025-01).

## December 2024

### Scouting and schedules

- Reorganized Collection stores and corrected history re-render loops, match restart behavior, and schedule repopulation after tournament selection. ([1aa0311d](https://github.com/HighlanderRobotics/lovat/commit/1aa0311d7866ae9c40ddb30e46abad721a59b55d), [e3ab4e7e](https://github.com/HighlanderRobotics/lovat/commit/e3ab4e7e1a7e13e2ce99bba58f7367c89259e8c4), [b3ed4bfc](https://github.com/HighlanderRobotics/lovat/commit/b3ed4bfcedb019e97ad9d68df78861028cdbab0c), [8b7dd217](https://github.com/HighlanderRobotics/lovat/commit/8b7dd21792e55929c2f714f96b3a566a22112474))

[Complete changes for December 2024](docs/history/2024.md#2024-12).

## November 2024

### Scouting and schedules

- Worked on faster match-schedule fetching and retained the older schedule path. ([668e536f](https://github.com/HighlanderRobotics/lovat/commit/668e536f3fb790d955247eb1d682a1b755a22d7b), [339d120c](https://github.com/HighlanderRobotics/lovat/commit/339d120c813af06aafa857862e1541ca1483ad23))

[Complete changes for November 2024](docs/history/2024.md#2024-11).

## August 2024

### Scouting and schedules

- Added Collection’s endgame reset control and restart-match alert. ([0e4a4dca](https://github.com/HighlanderRobotics/lovat/commit/0e4a4dca3cf8dbb6e2ff6c000493dec1683a5f22), [8496b8ef](https://github.com/HighlanderRobotics/lovat/commit/8496b8ef50ea3e66071bef4d18791c1e14cea638))

### Platform and reliability

- Added Collection linting, Prettier formatting, and CI; added Dashboard formatter/analyzer checks and expanded Server TypeScript ESLint rules. ([d38fae86](https://github.com/HighlanderRobotics/lovat/commit/d38fae86d0c045d499c637760ec7f5abf32121c9), [76b454e3](https://github.com/HighlanderRobotics/lovat/commit/76b454e382889b205f7412d522c94d4c7d5e488e), [e8243e98](https://github.com/HighlanderRobotics/lovat/commit/e8243e987bab526a3aaf794222b06606e5dd22c8), [076056ea](https://github.com/HighlanderRobotics/lovat/commit/076056ea004becabb8be2176d231a341e96e2d8e), [19bce63f](https://github.com/HighlanderRobotics/lovat/commit/19bce63f58a44bac41a0584bc42e5759a1b072cc))

[Complete changes for August 2024](docs/history/2024.md#2024-08).

## July 2024

### Analysis and predictions

- Removed obsolete 2023 game-piece placement, penalty, and scoring-method breakdowns. ([0fd42131](https://github.com/HighlanderRobotics/lovat/commit/0fd42131c4e3e084b5d5627c8ac4310d85374a6f), [765b454b](https://github.com/HighlanderRobotics/lovat/commit/765b454b49c5b10ad17873c2fb9eaa74730864f4), [1df69e4d](https://github.com/HighlanderRobotics/lovat/commit/1df69e4de04c2a953d27432df7a57ec25d3f9afa))

### Accounts and integrations

- Corrected Dashboard onboarding/settings BuildContext errors and simplified onboarding-completion handling. ([d3417642](https://github.com/HighlanderRobotics/lovat/commit/d341764205c54a6393e40154e5eb8eb15b6510c8), [94526fd2](https://github.com/HighlanderRobotics/lovat/commit/94526fd24723c6166ba0826c46d91ea49314cd8b), [90fc98ee](https://github.com/HighlanderRobotics/lovat/commit/90fc98eeb09a3a4d46bcea3fc3b8a34ca9ea4862))

### Platform and reliability

- Added Server tests and updated build/lint configuration. ([67d426c8](https://github.com/HighlanderRobotics/lovat/commit/67d426c870396de54ab285dc38d4f51332b0988c), [2c3f20e5](https://github.com/HighlanderRobotics/lovat/commit/2c3f20e5b6fb9ca7d4b8f9565213bc9ed0e18017))

[Complete changes for July 2024](docs/history/2024.md#2024-07).

## June 2024

### Picklists and exports

- Added downloadable scouting reports and Dashboard export by match, then renamed that mode to export by scouting report. Export rows now include scouter names. ([7b5b9660](https://github.com/HighlanderRobotics/lovat/commit/7b5b966021f8ee4989e20ac43f7320d82c4341c0), [e4ab9de2](https://github.com/HighlanderRobotics/lovat/commit/e4ab9de26571771bc682cb9cf6fc6d9122dc9bff), [6aca06b1](https://github.com/HighlanderRobotics/lovat/commit/6aca06b1913b655691e8c1710b71a87b5ca904b7), [476c747b](https://github.com/HighlanderRobotics/lovat/commit/476c747be795dba40ed0684f961b4fb612e548c5))

[Complete changes for June 2024](docs/history/2024.md#2024-06).

## May 2024

### Website and guides

- Added CSV-export instructions and clarified the wording of scouting statistics. ([5d0c4cb8](https://github.com/HighlanderRobotics/lovat/commit/5d0c4cb82d86907b90b6550c8af7d6774cc738e4), [2dbba4eb](https://github.com/HighlanderRobotics/lovat/commit/2dbba4ebbd5d0da6c6df3c8111b2915dd81b5c83))

[Complete changes for May 2024](docs/history/2024.md#2024-05).

## April 2024

### Scouting and schedules

- Added a QR-code size editor to Collection. ([7b18a771](https://github.com/HighlanderRobotics/lovat/commit/7b18a7718bfba968d9f90c80c95a073d42a11efa))

### Picklists and exports

- Added Server CSV exports and the Dashboard CSV exporter. ([e1e8e740](https://github.com/HighlanderRobotics/lovat/commit/e1e8e74058deba2421c642531fd9e6a028b0a32b), [b47ea76d](https://github.com/HighlanderRobotics/lovat/commit/b47ea76d91350e81c23bed8e085198b7206bcb63))

### Website and guides

- Added Collection content to the home page and updated downloads to use the Play Store. ([e8ceb071](https://github.com/HighlanderRobotics/lovat/commit/e8ceb071cab745ab22b179e66c87b1bb40156d91), [f57de83f](https://github.com/HighlanderRobotics/lovat/commit/f57de83fe6fe68d58a392af62ff3235ca5d2f44d))

### Platform and reliability

- Added team and picklist caching and worked on database indexing and stage-analysis performance. ([a5ef56e9](https://github.com/HighlanderRobotics/lovat/commit/a5ef56e9c12f4f5eb50b83c5253058c384a5ea90), [9ea6017d](https://github.com/HighlanderRobotics/lovat/commit/9ea6017df768d2e08683f53747b4aad86355ca8f), [78047d6c](https://github.com/HighlanderRobotics/lovat/commit/78047d6cea6e36d2f28ba9b94ab1210dc9dc8ae2))

[Complete changes for April 2024](docs/history/2024.md#2024-04).

## March 2024

### Scouting and schedules

- Added confirmation before discarding Collection match data and context menus for history entries. ([92a08ab8](https://github.com/HighlanderRobotics/lovat/commit/92a08ab85a8dba2dfaf509d41df23ca56a077cd4), [51643db3](https://github.com/HighlanderRobotics/lovat/commit/51643db312f96bdd880ed8587aa67f8122bc0f44))
- Added external-report counts and missing-tournament errors to Dashboard schedules; added a scouters section to the Website scouting-lead page. ([09e522ab](https://github.com/HighlanderRobotics/lovat/commit/09e522ab976932809ccba9af8ef278ae49e52ef3), [fe68729a](https://github.com/HighlanderRobotics/lovat/commit/fe68729a142fa30e152d5fcb544eba23021e7e7d), [fc118934](https://github.com/HighlanderRobotics/lovat/commit/fc118934ffb989db78ad9e451567899fc2a51f0a))

### Analysis and predictions

- Added autonomous-path score indicators and trap category metrics; fixed notes overflow and tournament-source breakdowns. ([ad694f11](https://github.com/HighlanderRobotics/lovat/commit/ad694f11b2e93b9af9fe772d1f860d010671d8e7), [9923381c](https://github.com/HighlanderRobotics/lovat/commit/9923381c18dbf99b6660895beb060eb7d741926a), [6185d0cc](https://github.com/HighlanderRobotics/lovat/commit/6185d0cc6d0e89ade7e184cbc34b90042e15f593), [bd4afde4](https://github.com/HighlanderRobotics/lovat/commit/bd4afde418c55364637d49950015029f7da55cc0))

### Picklists and exports

- Clarified shared/mutable picklist access for users without a team and corrected picklist sorting across tournaments. ([8b6808d3](https://github.com/HighlanderRobotics/lovat/commit/8b6808d34236f055a7c18e38d28ca04ef239c565), [6c470d20](https://github.com/HighlanderRobotics/lovat/commit/6c470d20e57ff986a1c516ddb431a884d333fa0b))

[Complete changes for March 2024](docs/history/2024.md#2024-03).

## February 2024

### Scouting and schedules

- Added Collection tournament selection during onboarding, handling for already-uploaded reports, and a back button on the game screen. Corrected tournament search and alliance colors. ([bb7a48ea](https://github.com/HighlanderRobotics/lovat/commit/bb7a48eacaacab1788fa501f8f0da4db90946714), [8b9e42b9](https://github.com/HighlanderRobotics/lovat/commit/8b9e42b9d7048cf6b30e4d1485a57cf2e105bb2b), [6730bed7](https://github.com/HighlanderRobotics/lovat/commit/6730bed71e54e63caaa3705944f74e680acf27df), [31da8c7e](https://github.com/HighlanderRobotics/lovat/commit/31da8c7ebd65a9674681853cdd88da6df1864112), [7855ee39](https://github.com/HighlanderRobotics/lovat/commit/7855ee3980385dcaabbd94138409c19c46832bd5))
- Added Dashboard schedule-editing errors and the Website scouting-lead page. ([ff3467f4](https://github.com/HighlanderRobotics/lovat/commit/ff3467f45b7655c8bbb31b5ab6d64ad5d7ef1deb), [bf497389](https://github.com/HighlanderRobotics/lovat/commit/bf4973891899a6b77db96c8b3e5d20daad1b7d1d))

### Analysis and predictions

- Added amp/speaker scores to alliance and prediction pages and Stage/High Note data to the match viewer. ([0bca146c](https://github.com/HighlanderRobotics/lovat/commit/0bca146c5a8bd4bc64bd16e283cce1831cf3a813), [e1efcbf4](https://github.com/HighlanderRobotics/lovat/commit/e1efcbf4b8c08eeb872d4d6fe4db9e0fbe637e3e), [3f1c0aaa](https://github.com/HighlanderRobotics/lovat/commit/3f1c0aaa37350ce50b1cdcf6309d223669a6717d))

### Picklists and exports

- Removed the cooperation slider and corrected duplicate metrics in picklist breakdowns. ([a8aea6f6](https://github.com/HighlanderRobotics/lovat/commit/a8aea6f6b6b37d37f4470eb7ec56730e56240e00), [cbfae475](https://github.com/HighlanderRobotics/lovat/commit/cbfae475256620fe4f3681c410b91a5b62dd619f))

### Accounts and integrations

- Fixed Android authentication after token expiry and verification-related team desynchronization. Added Website account-deletion forms. ([f821c0c6](https://github.com/HighlanderRobotics/lovat/commit/f821c0c6ad2ab84bd0c9f087a2592bef60b387df), [af6f533b](https://github.com/HighlanderRobotics/lovat/commit/af6f533b43ba3aae066d5bc5ef36b14afbeb0b19), [4a1142a1](https://github.com/HighlanderRobotics/lovat/commit/4a1142a1a1c76116c3947359e3bf8c17be020d30), [17e999b9](https://github.com/HighlanderRobotics/lovat/commit/17e999b9896b1487a683702343ad1e9e06a9c964))

[Complete changes for February 2024](docs/history/2024.md#2024-02).

## January 2024

### Scouting and schedules

- Added Collection report history, paginated QR codes, orientation controls, and field/alliance positioning fixes. ([b2f109b9](https://github.com/HighlanderRobotics/lovat/commit/b2f109b9b7d138b0dd51a66031bae10c298cc417), [26721de8](https://github.com/HighlanderRobotics/lovat/commit/26721de8b15bef79601ae5fdddcf20a7b3cabd50), [adf67611](https://github.com/HighlanderRobotics/lovat/commit/adf67611081cef7671a03b71cf0a9bbe81e26f98), [89cb702c](https://github.com/HighlanderRobotics/lovat/commit/89cb702c40f7132cbec472a98f59391341d3a59a))

### Analysis and predictions

- Updated Server analysis constants and Dashboard breakdown metrics for the 2024 game. ([3357e2e2](https://github.com/HighlanderRobotics/lovat/commit/3357e2e2855a89c7626c28ece24b400478abffb3), [b57ec1d3](https://github.com/HighlanderRobotics/lovat/commit/b57ec1d316b76ff9b1a234ebb5653e37d34f08a4))

### Picklists and exports

- Integrated Dashboard personal, shared, and mutable picklists with the new API. ([3d7aeb11](https://github.com/HighlanderRobotics/lovat/commit/3d7aeb11f69c71a1f50772a7d6110fd61b8a2a04), [7a52cc7d](https://github.com/HighlanderRobotics/lovat/commit/7a52cc7d2e2035261c1864d7952747c91d1aff60), [3661fa46](https://github.com/HighlanderRobotics/lovat/commit/3661fa46b7aa1e23e49c689a6ac994cc75635dd1))

### Accounts and integrations

- Added source-team/source-tournament onboarding settings, full team verification, and an account-deletion option in Dashboard reset settings. ([816e513f](https://github.com/HighlanderRobotics/lovat/commit/816e513f76f2bd5086ff0569258edd0f97c4f9a0), [83830d3b](https://github.com/HighlanderRobotics/lovat/commit/83830d3b19fc3fd9bfdb7ae66be31cbd89dfd986), [5a1ce878](https://github.com/HighlanderRobotics/lovat/commit/5a1ce878c96015f8a71b7f731f774db7a3954f8c), [0c4878c7](https://github.com/HighlanderRobotics/lovat/commit/0c4878c7ea28e22a50f54ce408d720a541c44191))

[Complete changes for January 2024](docs/history/2024.md#2024-01).

## December 2023

### Scouting and schedules

- Started the retained Collection repository and added Server scouting onboarding and report-based match flags. ([12e19137](https://github.com/HighlanderRobotics/lovat/commit/12e19137b8de76b802e4cfaa1f55372e57509896), [313ad63c](https://github.com/HighlanderRobotics/lovat/commit/313ad63cd1fdea842426364106aa1b1eadeb85ec), [4d4d466e](https://github.com/HighlanderRobotics/lovat/commit/4d4d466e8472ea695262e8d247c28f88cde13e83))

### Analysis and predictions

- Worked on Server match predictions and alliance analysis. ([467a4c34](https://github.com/HighlanderRobotics/lovat/commit/467a4c3452d801a0f7abaa880f4159d4006f15c1))

### Accounts and integrations

- Started a new Dashboard onboarding flow and added Website team-email verification. ([93853407](https://github.com/HighlanderRobotics/lovat/commit/9385340703f2bf3f57a4246bc63555b4704478fc), [3b481d0f](https://github.com/HighlanderRobotics/lovat/commit/3b481d0feb3e77ad35df48a75fa21159e98854dc))

[Complete changes for December 2023](docs/history/2023.md#2023-12).

## November 2023

### Scouting and schedules

- Started the retained Server repository and added Blue Alliance team/tournament fetching. ([1acab7a8](https://github.com/HighlanderRobotics/lovat/commit/1acab7a810a95909feac86b76db78caec9f3c9c9), [5591f000](https://github.com/HighlanderRobotics/lovat/commit/5591f000d7b3b7842135d67056c44b802e870e37))

### Accounts and integrations

- Added Server email verification, authentication fixes, and signature middleware. Website verifies Slack request signatures and forwards requests to the API. ([8a7cf142](https://github.com/HighlanderRobotics/lovat/commit/8a7cf142c0994ce5f7c1dec25de79be1b8c4219d), [d9f23803](https://github.com/HighlanderRobotics/lovat/commit/d9f238037bb94a5c5c663af59ce27fe63ec4b9d6), [8dd00b53](https://github.com/HighlanderRobotics/lovat/commit/8dd00b53167908736021ccf11c280abd1414c9bf), [015b393a](https://github.com/HighlanderRobotics/lovat/commit/015b393a04ab9b6700f7d03f28354ef07bb6253c))

### Website and guides

- Added analytics and redirected the support URL to the contact page. ([b7b96d5b](https://github.com/HighlanderRobotics/lovat/commit/b7b96d5b5e30c1a91e2754a440460730d7fe8b2f), [cd8d861e](https://github.com/HighlanderRobotics/lovat/commit/cd8d861ef2206eaf1980e0b2f97b64e2d67e61e1))

[Complete changes for November 2023](docs/history/2023.md#2023-11).

## October 2023

### Scouting and schedules

- Added a custom-tournament page and a control for adding scouters to schedules. ([11e6decc](https://github.com/HighlanderRobotics/lovat/commit/11e6decc7f2d600e2604211351348feec48a00db), [4a7d9b28](https://github.com/HighlanderRobotics/lovat/commit/4a7d9b2860772ce270239d8e3f8e2acef3fa2c12))

### Accounts and integrations

- Added role selection for all teams and fixed Website Slack-button authorization errors. ([8e9f62c3](https://github.com/HighlanderRobotics/lovat/commit/8e9f62c3f83f5fced458f87f0ed3bdaf9ed75bcf), [1f933c15](https://github.com/HighlanderRobotics/lovat/commit/1f933c153bb165e24e937bf62137d43382bed43a))

### Website and guides

- Added contact and waitlist pages and improved mobile form spacing. ([bbd75edb](https://github.com/HighlanderRobotics/lovat/commit/bbd75edb382440741feb05c4c58c9b2b8589b511), [3a4d067c](https://github.com/HighlanderRobotics/lovat/commit/3a4d067cc18d9a13e1cd3f6a3a0b1c5bf39e09ae), [33573a63](https://github.com/HighlanderRobotics/lovat/commit/33573a632a62c1920cd06fe089647caa6b0a67c5))

[Complete changes for October 2023](docs/history/2023.md#2023-10).

## September 2023

### Scouting and schedules

- Added a server-authority QR-code page and improved schedule/QR-scanner presentation. ([d39efe71](https://github.com/HighlanderRobotics/lovat/commit/d39efe718f077b93b71fcfcc82e7d961b5411899), [3a91d1cf](https://github.com/HighlanderRobotics/lovat/commit/3a91d1cf31c37c5ff0eb0462d2e62f5794ddc4ae), [9b92c80d](https://github.com/HighlanderRobotics/lovat/commit/9b92c80dbec3b40f895b94abb31378114b390be9))

### Picklists and exports

- Added picklist authors and undo controls for personal, shared, and mutable picklist deletion, plus mutable-picklist flags. ([36e99fc7](https://github.com/HighlanderRobotics/lovat/commit/36e99fc782070488e51a8b35c06a7f17c61bbfca), [6940e8e0](https://github.com/HighlanderRobotics/lovat/commit/6940e8e083502fdbfff6a2cfdbcf7e34791cf8f6), [fb708f37](https://github.com/HighlanderRobotics/lovat/commit/fb708f3714ad16e71009088c700e3bc78aace245), [dff73d99](https://github.com/HighlanderRobotics/lovat/commit/dff73d99cdfd6741ff7d6e665d9b121c9ac044b3), [3be60e93](https://github.com/HighlanderRobotics/lovat/commit/3be60e936d92ddee653e04769d71939939a548f4))

### Website and guides

- Introduced the public landing page, SEO/title tags, and a whitepaper redirect. Corrected mobile calls to action. ([fc3701b1](https://github.com/HighlanderRobotics/lovat/commit/fc3701b1a031cdc83275d2bfadfc171b98db95fb), [ea8b4f43](https://github.com/HighlanderRobotics/lovat/commit/ea8b4f437fff57b57a1d6ef522877bb007f8abf3), [8cf56b41](https://github.com/HighlanderRobotics/lovat/commit/8cf56b417cb7e24395322a2d0f55575bd52b5e5a), [3588dbaf](https://github.com/HighlanderRobotics/lovat/commit/3588dbaf308efc7f84a2bbda127dd5b9e25642f9))

[Complete changes for September 2023](docs/history/2023.md#2023-09).

## August 2023

### Analysis and predictions

- Added a team-per-match page. ([6762c020](https://github.com/HighlanderRobotics/lovat/commit/6762c02026c1d8781eddac010d4915d925054e1e))

### Accounts and integrations

- Removed the team-specific analyst choice from onboarding. ([7c96296f](https://github.com/HighlanderRobotics/lovat/commit/7c96296f78d60813f2f17f0485af5532599360ef))

### Platform and reliability

- Introduced reusable color combinations, emphasized containers, and friendly error views. ([69a1a0b2](https://github.com/HighlanderRobotics/lovat/commit/69a1a0b292a27f3028c64abed89d87aa8d103258), [f75dac49](https://github.com/HighlanderRobotics/lovat/commit/f75dac490e2b52cd84ca934540099bf9d4c8d410), [81fce7fc](https://github.com/HighlanderRobotics/lovat/commit/81fce7fc72ac74d2804ebbfcbe3b1eac40004f74))

[Complete changes for August 2023](docs/history/2023.md#2023-08).

## June 2023

### Scouting and schedules

- Added team suggestions to match-schedule filters. ([a146f7ff](https://github.com/HighlanderRobotics/lovat/commit/a146f7ff7ac034a4690f98d74d9609f66de653e9))

### Analysis and predictions

- Disabled interaction with categories that have no detail data and improved loading indicators. ([b8397ef1](https://github.com/HighlanderRobotics/lovat/commit/b8397ef15b7f0ecd830b2e8efdf4e242fc51318e), [450987d8](https://github.com/HighlanderRobotics/lovat/commit/450987d83524d9f0b3a9f64fed72d3cae5782b6f))

### Picklists and exports

- Fixed newly created picklists not appearing immediately and added a skeleton loading screen. ([312db4c7](https://github.com/HighlanderRobotics/lovat/commit/312db4c7adecffb6213e28a36f5a13f20b1794f0), [0627217a](https://github.com/HighlanderRobotics/lovat/commit/0627217a1ab6d24314b42e08ad2b7a22f1022066))

[Complete changes for June 2023](docs/history/2023.md#2023-06).

## May 2023

### Scouting and schedules

- Fixed match-schedule clipping at the bottom of the screen. ([6c77711c](https://github.com/HighlanderRobotics/lovat/commit/6c77711c764606ccafdb30fa434196a92c97b0b5))

### Picklists and exports

- Corrected bottom clipping in personal, shared, and mutable picklists and adjusted picklist visualization padding. ([305f3e10](https://github.com/HighlanderRobotics/lovat/commit/305f3e10b7b09a5bd7871861c81f30fcabe39afb), [4bfec1ce](https://github.com/HighlanderRobotics/lovat/commit/4bfec1ce5c1b0da9ef97d1f2b8a2821688c67980), [c01603db](https://github.com/HighlanderRobotics/lovat/commit/c01603db152cca1dcbda68fa74e8fc81445b8c27), [c7f56b56](https://github.com/HighlanderRobotics/lovat/commit/c7f56b56ea8381b9ec58b97e087fc91df472671c))

### Platform and reliability

- Removed the version-increment workflow that caused merge conflicts. ([439d9a36](https://github.com/HighlanderRobotics/lovat/commit/439d9a36ab811899749ebaa657d9e9631a3975dd))

[Complete changes for May 2023](docs/history/2023.md#2023-05).

## April 2023

### Scouting and schedules

- Added scouting-report viewing and deletion. ([e2fc2392](https://github.com/HighlanderRobotics/lovat/commit/e2fc2392c7271912ccdbb5bfd754c7e3318a0d73))

### Analysis and predictions

- Added suggestions for hypothetical matches and mobility/starting-position information to autonomous-path names. Fixed missing matches in breakdown details. ([6074c9f9](https://github.com/HighlanderRobotics/lovat/commit/6074c9f96803a03eff9b50eb02566a486e104bf8), [e46cab61](https://github.com/HighlanderRobotics/lovat/commit/e46cab619e3aa59951648f5045836c0b23b995fa), [2e3a76c3](https://github.com/HighlanderRobotics/lovat/commit/2e3a76c37faf772b0c2ac8edf70ef29f449211fa))

### Picklists and exports

- Added mutable picklists, fixed stale updates, corrected breakdown sorting, and animated weight breakdowns. ([d48f4dc0](https://github.com/HighlanderRobotics/lovat/commit/d48f4dc02290248cd9f56414643ca8e857b32686), [022d3e8a](https://github.com/HighlanderRobotics/lovat/commit/022d3e8af1bbf01eaf80c167f0a01be4b4a5cc68), [2fcdd02f](https://github.com/HighlanderRobotics/lovat/commit/2fcdd02fa2fe8dcf94bdf8259ad2ee009ae164fb), [2a9f991b](https://github.com/HighlanderRobotics/lovat/commit/2a9f991b09054849baf52222fb19b70563856835))

[Complete changes for April 2023](docs/history/2023.md#2023-04).

## March 2023

### Scouting and schedules

- Improved report QR scanning and fixed setup QR codes. ([ad8461fb](https://github.com/HighlanderRobotics/lovat/commit/ad8461fb01cc3b1ab1644a42bc9ad824512c4a7d), [6e3ea553](https://github.com/HighlanderRobotics/lovat/commit/6e3ea5533ce1b2b6ad17d97c6858c2673b95022c))

### Analysis and predictions

- Added the match-predictor page, corrected winning percentages, and adjusted climb points. ([87a2679b](https://github.com/HighlanderRobotics/lovat/commit/87a2679bcc056ab0d0985e8916c027272ac33194), [9af4b666](https://github.com/HighlanderRobotics/lovat/commit/9af4b666ac3f14ff9e6852dec2c5fa0283d9979e), [698ab5fd](https://github.com/HighlanderRobotics/lovat/commit/698ab5fda05be3c16bf36712cee59b758a0a6eb6))

### Picklists and exports

- Added shared picklists and a teleop-climb picklist metric. ([b3b6f8b4](https://github.com/HighlanderRobotics/lovat/commit/b3b6f8b4b035d0cb240aa4a51c43c1a16458eec2), [724fe9f1](https://github.com/HighlanderRobotics/lovat/commit/724fe9f1ca1acd72bcec479b0ade7709ea233551))

[Complete changes for March 2023](docs/history/2023.md#2023-03).

## February 2023

### Scouting and schedules

- Fixed web QR-code scanning and added a week-zero testing tournament. ([fccceb75](https://github.com/HighlanderRobotics/lovat/commit/fccceb758a0fb68ed45b5deee8120c8427202807), [df6f6265](https://github.com/HighlanderRobotics/lovat/commit/df6f62657753a016af41d9f9706261ceefd57266))

### Analysis and predictions

- Added autonomous paths to team details and alliance path isolation, plus season-specific alliance analysis. ([7470cd4e](https://github.com/HighlanderRobotics/lovat/commit/7470cd4e6f4d57c47927e4e14753a88dddd8aa78), [6b615fda](https://github.com/HighlanderRobotics/lovat/commit/6b615fdabe0231edb6f3a8edf8de7df8f9b2660b), [6bdeb959](https://github.com/HighlanderRobotics/lovat/commit/6bdeb9598a0bd884e18b3733334e556dd01068a4))

### Picklists and exports

- Added picklists, breakdowns, and additional metrics. ([ce90cb21](https://github.com/HighlanderRobotics/lovat/commit/ce90cb21fbec92f610348ae0171b55bcfac2be37), [22e6d601](https://github.com/HighlanderRobotics/lovat/commit/22e6d601dfb3e9442905b660894fa488091a247f), [0de4d106](https://github.com/HighlanderRobotics/lovat/commit/0de4d1063b76ad68ecdc2741847cd561f3e053db))

[Complete changes for February 2023](docs/history/2023.md#2023-02).

## January 2023

### Scouting and schedules

- Added the match schedule, scouting-schedule QR codes, and a report QR scanner. Match notes now use match keys. ([739b093c](https://github.com/HighlanderRobotics/lovat/commit/739b093c2d57750c17a2ba65af3012bb7c0c369e), [fee49d65](https://github.com/HighlanderRobotics/lovat/commit/fee49d65a528198e7f6ee1609e483f7a62cf3f26), [cd7a1b6f](https://github.com/HighlanderRobotics/lovat/commit/cd7a1b6f8e4348ac01f78551c62230fdd492b2b7), [18a240a7](https://github.com/HighlanderRobotics/lovat/commit/18a240a795e37bfdc71fd799f1c2de9679d35eca))

### Analysis and predictions

- Added team overview, team-detail graphs, sparklines, average tiles, and abstract team breakdowns. ([4d685b5b](https://github.com/HighlanderRobotics/lovat/commit/4d685b5b43d51ed31033fe78fb019526a3553733), [687f5d6a](https://github.com/HighlanderRobotics/lovat/commit/687f5d6a07becdb6ff25b949681d8efc05326041), [581358fb](https://github.com/HighlanderRobotics/lovat/commit/581358fb8f429c7e99b1e13f1ce8e66899d44f0c), [90300fab](https://github.com/HighlanderRobotics/lovat/commit/90300fabc97b37678a4670133ad373b2ccc31baf), [264ecdba](https://github.com/HighlanderRobotics/lovat/commit/264ecdba51a091376277055b916c2f15de8ed9f2))

### Platform and reliability

- Improved desktop layouts and onboarding and enabled macOS operation. ([8d18ec04](https://github.com/HighlanderRobotics/lovat/commit/8d18ec04b182f2d8348cfcd101ec1471edc995af), [f5a3da3a](https://github.com/HighlanderRobotics/lovat/commit/f5a3da3a47ae57b65105ae60970b6840aeb1d981), [2d0d8dfe](https://github.com/HighlanderRobotics/lovat/commit/2d0d8dfed66dbda0398b0170912be5c97a6d9b22))

[Complete changes for January 2023](docs/history/2023.md#2023-01).

## December 2022

### Scouting and schedules

- Started the earliest retained Lovat repository and added the Dashboard scout-schedule editor. Corrected schedule saving and parsing. ([6b510ae2](https://github.com/HighlanderRobotics/lovat/commit/6b510ae2975c182a86d3fd6bc9bb6d928755b482), [72a6e1f8](https://github.com/HighlanderRobotics/lovat/commit/72a6e1f8809867d587ea166d4f60fc6948459bff), [40bb06e3](https://github.com/HighlanderRobotics/lovat/commit/40bb06e38504fe3e43d0455d1489d371abccbf45), [7fa06677](https://github.com/HighlanderRobotics/lovat/commit/7fa06677602c7c70527da19dcf3c83a3ca562271))

### Analysis and predictions

- Connected score-predictor inputs and fixed a stretched analysis loading indicator. ([165f6769](https://github.com/HighlanderRobotics/lovat/commit/165f6769da75e8b19b4bacfa6674038a6ebda561), [9db87576](https://github.com/HighlanderRobotics/lovat/commit/9db87576d8276e9d7fc1270d1de77957d14bc89c))

[Complete changes for December 2022](docs/history/2022.md#2022-12).
