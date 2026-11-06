# SPDX-FileCopyrightText: 2026 Francisco Angulo de Lafuente
# SPDX-License-Identifier: MIT
# Research-Project: Decision Drift Sentinel
# Research-Date: 2026-11-04
# Research-ORCID: https://orcid.org/0009-0001-1634-7063
# Attribution-Recorded-On: 2026-11-06
# Reuse: Preserve the MIT notice and cite the project author.

"""Export the 2 CFR 200 benchmark and the Python reference verdicts as one JSON fixture.

The reference implementation is the published Regulation Change Sentinel
(https://github.com/Agnuxo1/zetaris-regulation-change-sentinel, MIT). This script
imports its unmodified `src/control_direct.py` and `src/control_modal_v2.py`, runs
every variant offline and writes the inputs, the labels and the per-case verdicts
so the JavaScript port can be checked case by case without Python.

Usage:
    python bench/export_reference.py <path-to-reference-checkout> bench/fixtures/cfr200_benchmark.json
"""
from __future__ import annotations

import csv
import hashlib
import json
import subprocess
import sys
from pathlib import Path


def main(ref: Path, out: Path) -> None:
    sys.path.insert(0, str(ref))
    from src import control_direct as v1, control_modal_v2 as v2  # noqa: E402
    sys.path.insert(0, str(ref / "scripts"))
    import evaluate_modal_variants as ev  # noqa: E402

    reg = list(csv.DictReader((ref / "data/processed/compliance_register.csv").open(encoding="utf-8")))
    paras = list(csv.DictReader((ref / "data/processed/paragraphs.csv").open(encoding="utf-8")))
    newp = [r for r in paras if r["version_date"] == "2024-10-01"]
    versions = json.loads((ref / "data/raw/ecfr/versions_title2_part200.json").read_text(encoding="utf-8"))["content_versions"]
    labels = {r["assessment_id"]: r for r in csv.DictReader((ref / "eval/labeling/labels.csv").open(encoding="utf-8"))}

    variants = {
        "v1": v1.decide(reg, newp, versions),
        "modal_v2": v2.decide(reg, newp, versions),
        "distance_045": v1.decide(reg, newp, versions, max_distance=0.45),
        "authority": v1.decide(reg, newp, versions, fact_extractor=ev.authority_facts),
    }
    sections = sorted({r["section_id"] for r in reg})
    cases = []
    for r in reg:
        i = r["assessment_id"]
        cases.append({
            "id": i,
            "section": r["section_id"],
            "cited_text": r["cited_text"],
            "truth_material": i in labels and labels[i]["label"] == "MATERIAL",
            "label_confidence": labels[i]["confidence"] if i in labels else "identical",
            "facts_v1": v1.facts(r["cited_text"]),
            "facts_modal_v2": v2.facts(r["cited_text"]),
            "reference": {k: variants[k][i] for k in variants},
        })
    sha = subprocess.run(["git", "-C", str(ref), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    fixture = {
        "source": "https://github.com/Agnuxo1/zetaris-regulation-change-sentinel",
        "source_commit": sha,
        "licence": "code MIT; eCFR text U.S. Government work (public domain); register fictional CC0 1.0",
        "labels": "eval/labeling/labels.csv of the reference repository (one annotator, blind to the method)",
        "new_version_date": "2024-10-01",
        "paragraphs": [{"section": p["section_id"], "ordinal": int(p["ordinal"]), "text": p["paragraph_text"]}
                       for p in newp if p["section_id"] in sections],
        "cases": cases,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    data = json.dumps(fixture, indent=1, ensure_ascii=False)
    out.write_text(data + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"cases": len(cases), "paragraphs": len(fixture["paragraphs"]), "source_commit": sha,
                      "sha256": hashlib.sha256((data + "\n").encode("utf-8")).hexdigest()}))


if __name__ == "__main__":
    main(Path(sys.argv[1]).resolve(), Path(sys.argv[2]))
