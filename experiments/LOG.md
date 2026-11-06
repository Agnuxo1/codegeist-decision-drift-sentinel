# Experiment log

Research author: Francisco Angulo de Lafuente · [ORCID](https://orcid.org/0009-0001-1634-7063) · Attribution record: 2026-11-06.

Each change: hypothesis → experiment → control → metric → decision. Negative results are kept.
Data: the public 48-assessment benchmark on the 1 October 2024 rewrite of 2 CFR 200 (official eCFR text, U.S. public
domain; fictional register, CC0; labels by one annotator blind to the method), exported from
`Agnuxo1/zetaris-regulation-change-sentinel` @ `79e9b5b` by `bench/export_reference.py`. Outputs:
`results/benchmark.json`, `results/predictions.csv`.

| Id | Hypothesis | Result | Decision |
|---|---|---|---|
| E001 | The JavaScript port reproduces the Python reference | 48/48 identical verdicts for v1, modal v2 and threshold 0.45; identical facts on all 48 passages | the JS core is the app's implementation |
| E002 | H1: lower review load than the controls without missing material changes | v1 reviews 25/48, P 0.640, R 0.842, F1 0.727; control "text changed" 45/48, F1 0.594; control "everything amended" 48/48, F1 0.567. 95% section-bootstrap CI of ΔF1 vs the text-changed control: [0.004, 0.285] | H1 holds at this scale; 3 of 19 material changes are missed (modal and scope wording) |
| E003 | Ablation of the fact extractor | numbers only F1 0.706 (R 0.632); words only 0.540; both 0.727 | keep both |
| E004 | Modal v2 (`will`/`can`) | F1 0.756, R 0.895, 26 reviews; chosen after error analysis on these same 48 cases | app default, reported as exploratory; the pre-registered figure is v1 |
| E005 | Threshold sensitivity | 0.30 → 0.667; 0.45–0.50 → 0.739; 0.60 → 0.756; 0.70–0.80 → 0.727 | keep 0.60 (fixed before the labels existed) |

Limits: 48 cases and one annotator; this does not show performance on unseen regulations. Next: an external set
(another eCFR rewrite or Confluence policy pages) labelled by a person, and an LLM-judge control if a free, permitted
model is available inside the rules.

**Audit reproduction note (2026-11-06).** `npm run bench` reproduced the recorded metrics, but on this LF checkout it generated fixture hash `6ed685c4ba70250d460556e00c789207d8028aec9d727d9de19a637086f427c2` instead of the committed `d24aa9e8f9d5fe220729648fbd90324debac0d5104c4f7bbca270514bf405a3a`. Converting only the fixture's LF line endings to CRLF reproduces the committed hash; the numeric outputs matched. The script hashes raw fixture bytes, so this metadata hash varies with checkout line endings. The committed result artifact was preserved.

Original research: [Francisco Angulo de Lafuente](https://orcid.org/0009-0001-1634-7063). Documentation edition: 2026-11-04. Preserve the MIT notice for original software and cite this project.
