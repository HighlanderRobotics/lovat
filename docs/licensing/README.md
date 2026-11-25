# Lovat licensing proposal

**Draft for review only. These files do not grant a license to Lovat.** Do not move the proposed text to the repository root or change package license metadata until the approvals and checks in [LVT-392](https://linear.app/highlander-robotics/issue/LVT-392) are recorded.

## Proposed scope

| Area | Proposal |
| --- | --- |
| First-party Server/API, Worker, Dashboard, Collection, Website, Learn application code, and shared code | [AGPL-3.0-only](proposed/AGPL-3.0-only.txt), for code the approved rights holders can license |
| Standalone Magnolia UI, standalone SDKs, and original Learn prose | Separate decisions under [LVT-395](https://linear.app/highlander-robotics/issue/LVT-395). MIT, Apache-2.0, and CC BY 4.0 are respectively proposed, not granted here. Code examples and media require their own review. |
| Third-party code and media, brand assets, private reports, and external datasets | Do not assume coverage under the core license. Preserve original terms and notices. Handle brand and data rights separately in [LVT-396](https://linear.app/highlander-robotics/issue/LVT-396). |

This proposal uses the version 3 text, with no “or later” option in the intended grant. The appendix in the unchanged license text is an example, not a grant for this repository. AGPL requires a source offer to remote users of a modified network-interactive version under section 13 and has separate obligations for distribution. It does not require every private change to be public or sent upstream. Public forks and upstream PRs are encouraged as a project practice, tracked separately in [LVT-394](https://linear.app/highlander-robotics/issue/LVT-394).

## Before applying the license

- [ ] Confirm the choice, copyright holders, and authority to license existing contributions across the [imported repositories](../migration/source-revisions.md) and later monorepo work. Record team/mentor approval and any needed permissions or exclusions.
- [ ] Resolve the existing **ISC** declaration in `apps/server/package.json` and its lockfile against the predecessor history; do not silently replace it or imply previously granted rights are revoked. Preserve the vendored MIT notice in `apps/dashboard/packages/chips_input/LICENSE`. Verify the provenance, terms, and notices for the bundled fonts and artwork.
- [ ] Check dependency compatibility and mobile-store distribution terms. Define exceptions explicitly and keep separate SDKs from inadvertently incorporating core code.
- [ ] Once approved, add the unchanged root `LICENSE`, an explicit AGPL-3.0-only notice and applicable package metadata. Add release-specific corresponding source and build instructions, a prominent source offer where required, and CI checks for license and notice consistency. Verify the source links match each deployed revision and confirm GitHub license detection.

Implementation: [LVT-393](https://linear.app/highlander-robotics/issue/LVT-393).
