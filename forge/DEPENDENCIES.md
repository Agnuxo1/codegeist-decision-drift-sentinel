# Dependency validation snapshot — 10 November 2026

Direct pins: Forge API8.5.0, Bridge7.3.0, KVS2.1.2, React12.5.0, Resolver2.0.2,
and React18.3.1. See package.json and the integrity-pinned package-lock.json.

The initial registry audit reported13affected runtime packages, propagated from
three underlying advisories. This candidate overrides their transitive versions:

| Package | Exact patch | Primary advisory |
|---|---|---|
| prosemirror-view | 1.42.3 | [Paste XSS](https://github.com/advisories/GHSA-c8x8-7fp4-3x9w) |
| glob | 14.0.2 | [Cancellation handling](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) |
| minimatch | 11.0.1 | [Pattern amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249) |

The direct SDK pins were retained. No npm audit fix--force or automatic SDK
downgrade was used. The patched full audit reported0advisories, and the20tests,
TypeScript and real SDK bundles passed with this lock. Cross-major transitive
overrides still require the actual Forge/cloud tests listed in README.md. This
dated audit is neither a lasting security guarantee nor cloud qualification.

The Bridge7.3type definitions allow direct resolver envelopes and an optional
`body` wrapper carrying metadata. The frontend protocol handles both and rejects
incomplete or failed responses; these paths have explicit local tests.
