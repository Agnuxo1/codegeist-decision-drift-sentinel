# License scope

Attribution record: 2026-11-06. Project: Decision Drift Sentinel. Author: Francisco Angulo de Lafuente, [ORCID 0009-0001-1634-7063](https://orcid.org/0009-0001-1634-7063).

## MIT-licensed original software

The root [LICENSE](LICENSE) contains the SPDX MIT License text and applies to the author's original software in this repository: `src/core/drift.js`, `test/drift.test.js`, `bench/export_reference.py`, `bench/run_benchmark.js`, `tools/render_lab_figures.py`, and `tools/render_science_figures.py`. It also covers the author's original project prose and metadata in `.gitignore`, `README.md`, `LICENSE_SCOPE.md`, `CITATION.cff`, `codemeta.json`, `provenance.json`, `provenance-baseline.json`, `experiments/LOG.md`, `docs/figures/README.md`, `docs/figures/figures.json`, `docs/figures/provenance.json`, `docs/science-figures/PROVENANCE.md`, and `docs/science-figures/figure-spec.json`, except for separately identified third-party content or data. `package.json`, `CITATION.cff`, and `codemeta.json` describe this software as MIT-licensed.

The JavaScript core documents its lineage to the author's own [Regulation Change Sentinel](https://github.com/Agnuxo1/zetaris-regulation-change-sentinel/tree/79e9b5b6e843b776d734c98ef9e3800731ce3ecf), whose `LICENSE` at that commit is MIT and retains the same copyright holder. Preserve that attribution and the MIT notices when reusing derived code.

## Material outside that grant

- `bench/fixtures/cfr200_benchmark.json` is a mixed research fixture and is not licensed wholesale by this repository's MIT grant. Its source metadata identifies the 2024-10-01 eCFR text for 2 CFR Part 200 and the separately authored fictional register. U.S. Government works are generally outside U.S. copyright under [17 U.S.C. § 105](https://www.govinfo.gov/content/pkg/USCODE-2022-title17/html/USCODE-2022-title17-chap1-sec105.htm); [GovInfo's notice](https://www.govinfo.gov/about/policies) cautions that government publications can contain third-party material. The upstream `LICENSE` and fixture metadata designate the fictional register CC0 1.0. Benchmark labels and the assembled mixed fixture receive no additional license assertion here.
- `results/benchmark.json` and its generated metrics are evidence derived from that fixture. This record assigns no separate data license to them.
- Generated image files under `docs/figures/` and `docs/science-figures/` are not licensed by the renderer's MIT license. The science banner is identified as an AI-generated editorial illustration; its reuse rights, and any separate rights in generated image outputs, remain unresolved. Their provenance sidecars identify the renderers and sources.
- Bibliographic works linked from the documentation retain their own terms. No third-party source code is vendored in the repository tree; the identified software lineage is the author's separate MIT-licensed repository above.

This scope note does not change the rights in source material or grant rights the author does not hold. Where this file does not state a license, no new license is asserted.
