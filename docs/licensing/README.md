# Lovat licensing proposal

**Draft for review only. These files do not grant a license to Lovat.** Do not move the proposed text to the repository root or change package license metadata until the approvals and checks in [LVT-392](https://linear.app/highlander-robotics/issue/LVT-392) are recorded.

## Proposed scope

| Area | Proposal |
| --- | --- |
| First-party Server/API, Worker, Dashboard, Collection, Website, Learn application code, and shared code | [AGPL-3.0-only](proposed/AGPL-3.0-only.txt), for code the approved rights holders can license |
| Standalone Magnolia UI, standalone SDKs, and original Learn prose | Separate decisions under [LVT-395](https://linear.app/highlander-robotics/issue/LVT-395). MIT, Apache-2.0, and CC BY 4.0 are respectively proposed, not granted here. Code examples and media require their own review. |
| Third-party code and media, brand assets, private reports, and external datasets | Do not assume coverage under the core license. Preserve original terms and notices. Handle brand and data rights separately in [LVT-396](https://linear.app/highlander-robotics/issue/LVT-396). |

This proposal uses the version 3 text, with no “or later” option in the intended grant. The appendix in the unchanged license text is an example, not a grant for this repository. AGPL requires a source offer to remote users of a modified network-interactive version under section 13 and has separate obligations for distribution. It does not require every private change to be public or sent upstream. Public forks and upstream PRs are encouraged as a project practice, tracked separately in [LVT-394](https://linear.app/highlander-robotics/issue/LVT-394).

## Third-party notices

| Material | Treatment |
| --- | --- |
| Vendored Dashboard `chips_input` | Keep the existing [upstream MIT notice](../../apps/dashboard/packages/chips_input/LICENSE). Confirm it is included in app distributions where the vendored code ships. |
| Heebo font | Preserve the SIL OFL 1.1 notice alongside the font files in [Dashboard](../../apps/dashboard/assets/fonts/Heebo-OFL.txt) and [Collection](../../apps/collection/assets/fonts/Heebo-OFL.txt). |
| Collection Material Symbols Rounded | Keep the [Apache 2.0 notice](../../apps/collection/assets/fonts/Material-Symbols-Apache-2.0.txt) with all three font variants. |
| Dashboard Roboto Mono Regular | Keep the [Apache 2.0 notice](../../apps/dashboard/assets/fonts/RobotoMono-Apache-2.0.txt) for this bundled version. The binary embeds Apache 2.0 metadata; do not substitute the current upstream OFL notice. |
| Website's adapted SvelteKit hook | Keep the upstream [MIT notice](../../apps/website/static/notices/SvelteKit-MIT.txt) and the reference in `hooks.server.ts`. |

The following are **not cleared for inclusion in the proposed first-party grant**:

- Dashboard's `assets/sounds/*.mp3` files identify GarageBand as the encoder, not the source of the audio. Verify original authorship and any source samples, or replace them with documented originals.
- Confirm provenance and redistribution terms for Collection's `field-2026.png` and Dashboard's field background and FRC game-piece SVGs, including depictions in Learn/Website media. A stylized redraw is not evidence of its source. Replace unclear assets or keep them expressly outside the grant where separate redistribution permission is confirmed.
- The Website pins legacy [`magnolia-ui-svelte` at `852aee5`](https://github.com/HighlanderRobotics/magnolia-ui-svelte/tree/852aee5fd375aaaa31a2324135a1b8d9f711de46). That revision has no license file or manifest declaration. Verify permission for that revision and its local patch, or switch to a cleared release. A license on the new Magnolia repository does not resolve this by itself.
- Keep team branding, private reports, external datasets, and match media out of the code grant. Review demo fixtures separately.

## Before applying the license

- [ ] Confirm the choice, copyright holders, and authority to license existing contributions across the [imported repositories](../migration/source-revisions.md) and later monorepo work. Record team/mentor approval and any needed permissions or exclusions.
- [ ] Record the disposition of the existing **ISC** metadata in Server's manifest and lockfile. It appears in the [initial Server commit](https://github.com/HighlanderRobotics/lovat/commit/1acab7a810a95909feac86b76db78caec9f3c9c9), and no corresponding Server license file was found in the checked history. This supports a scaffold explanation, not a determination about prior grants. Leave the metadata unchanged until approved.
- [ ] Resolve the remaining provenance items above. Confirm applicable notices are included in actual Dashboard and Collection release artifacts; checked-in files alone do not prove mobile bundling. Check deployment and dependency notices separately.
- [ ] Check dependency compatibility and mobile-store distribution terms. Define exceptions explicitly and keep separate SDKs from inadvertently incorporating core code.
- [ ] Once approved, add the unchanged root `LICENSE`, an explicit AGPL-3.0-only notice and applicable package metadata. Add release-specific corresponding source and build instructions, a prominent source offer where required, and CI checks for license and notice consistency. Verify the source links match each deployed revision and confirm GitHub license detection.

Implementation: [LVT-393](https://linear.app/highlander-robotics/issue/LVT-393).
