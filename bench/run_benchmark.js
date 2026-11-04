// SPDX-FileCopyrightText: 2026 Francisco Angulo de Lafuente
// SPDX-License-Identifier: MIT
// Research-Project: Decision Drift Sentinel
// Research-Date: 2026-11-04
// Research-ORCID: https://orcid.org/0009-0001-1634-7063
// Reuse: Preserve the MIT notice and cite the project author.

// Replays the 2 CFR 200 benchmark (48 real assessments) with the JavaScript core:
// the Sentinel rule, two professional controls and the ablations, with section-level
// bootstrap intervals. Writes results/benchmark.json and results/predictions.csv.
//
//   node bench/run_benchmark.js
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { classifyCitation, factsModal, factsV1, metrics } from '../src/core/drift.js';

const fixturePath = new URL('./fixtures/cfr200_benchmark.json', import.meta.url);
const raw = readFileSync(fixturePath, 'utf8');
const fixture = JSON.parse(raw);
const bySection = new Map();
for (const p of fixture.paragraphs) {
  if (!bySection.has(p.section)) bySection.set(p.section, []);
  bySection.get(p.section).push({ ordinal: p.ordinal, text: p.text });
}
const cases = fixture.cases;
const truth = cases.map(c => c.truth_material);

const NUMBER_ONLY = text => factsV1(text).filter(f => /^[0-9]/.test(f));
const WORDS_ONLY = text => factsV1(text).filter(f => !/^[0-9]/.test(f));
// Error-analysis variant of the reference (scripts/evaluate_modal_variants.py: authority_facts).
const authorityFacts = text => {
  const t = (text || '').toLowerCase().replaceAll('non-federal entity', 'recipient or subrecipient');
  const roles = [...t.matchAll(/\b(?:federal agency|pass-through entity|recipient|subrecipient)\b/g)].map(m => 'role:' + m[0]);
  return [...new Set([...factsV1(text), ...roles])].sort();
};

const sentinel = options => cases.map(c => classifyCitation(c.cited_text, bySection.get(c.section) || [], options));
const flags = results => results.map(r => r.needsReview);

const methods = {
  control_all_amended: {
    role: 'control', note: 'Re-review every assessment whose section the eCFR marks as amended (all 48 sections were amended).',
    predicted: cases.map(() => true),
  },
  control_text_changed: {
    role: 'control', note: 'Re-review whenever the quoted text is no longer present verbatim.',
    predicted: sentinel({ facts: factsV1 }).map(r => r.verdict !== 'UNCHANGED'),
  },
  sentinel_v1: { role: 'pre-registered', note: 'Published rule: successor by distance <= 0.60, v1 facts.', predicted: flags(sentinel({ facts: factsV1 })) },
  sentinel_modal_v2: {
    role: 'exploratory', note: 'v1 plus modals will/can; chosen after error analysis on these same 48 cases.',
    predicted: flags(sentinel({ facts: factsModal })),
  },
  ablation_numbers_only: { role: 'ablation', predicted: flags(sentinel({ facts: NUMBER_ONLY })) },
  ablation_words_only: { role: 'ablation', predicted: flags(sentinel({ facts: WORDS_ONLY })) },
  ablation_authority_roles: { role: 'ablation', predicted: flags(sentinel({ facts: authorityFacts })) },
};
for (const d of [0.3, 0.45, 0.5, 0.6, 0.7, 0.8]) {
  methods[`ablation_distance_${String(d).replace('.', '')}`] = { role: 'ablation', predicted: flags(sentinel({ facts: factsModal, maxDistance: d })) };
}

// Deterministic section bootstrap (mulberry32), 2000 resamples.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const groups = new Map();
cases.forEach((c, i) => { if (!groups.has(c.section)) groups.set(c.section, []); groups.get(c.section).push(i); });
const keys = [...groups.keys()].sort();
const SEEDS = [20261030, 20261031, 20261101];
const B = 2000;
function bootstrap(predA, predB, seed) {
  const rng = mulberry32(seed);
  const f1 = [], delta = [];
  for (let b = 0; b < B; b++) {
    const ix = [];
    for (let k = 0; k < keys.length; k++) ix.push(...groups.get(keys[Math.floor(rng() * keys.length)]));
    const y = ix.map(i => truth[i]);
    const fa = metrics(y, ix.map(i => predA[i])).f1;
    f1.push(fa);
    if (predB) delta.push(fa - metrics(y, ix.map(i => predB[i])).f1);
  }
  const q = arr => { const s = [...arr].sort((a, b) => a - b); return [s[Math.floor(0.025 * B)], s[Math.floor(0.975 * B) - 1]]; };
  return { f1_ci95: q(f1), delta_f1_ci95: predB ? q(delta) : null };
}

const round = x => (x === null ? null : Math.round(x * 1e4) / 1e4);
const out = { benchmark: '2 CFR 200 rewrite of 2024-10-01, 48 assessments, 19 material', fixture_sha256: createHash('sha256').update(raw).digest('hex'),
  source_commit: fixture.source_commit, bootstrap: { unit: 'section', resamples: B, seeds: SEEDS }, methods: {} };
for (const [name, m] of Object.entries(methods)) {
  const met = metrics(truth, m.predicted);
  const boots = SEEDS.map(s => bootstrap(m.predicted, methods.control_text_changed.predicted, s));
  out.methods[name] = {
    role: m.role, note: m.note,
    ...Object.fromEntries(Object.entries(met).map(([k, v]) => [k, round(v)])),
    review_load_saved: round(1 - met.flagged / cases.length),
    f1_ci95_by_seed: boots.map(b => b.f1_ci95.map(round)),
    delta_f1_vs_text_changed_ci95_by_seed: boots.map(b => b.delta_f1_ci95.map(round)),
  };
}
mkdirSync(new URL('../results/', import.meta.url), { recursive: true });
writeFileSync(new URL('../results/benchmark.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
const header = ['id', 'section', 'truth_material', ...Object.keys(methods)];
const rows = cases.map((c, i) => [c.id, c.section, Number(c.truth_material), ...Object.values(methods).map(m => Number(m.predicted[i]))]);
writeFileSync(new URL('../results/predictions.csv', import.meta.url), [header, ...rows].map(r => r.join(',')).join('\n') + '\n');
for (const [name, m] of Object.entries(out.methods)) {
  console.log(`${name.padEnd(28)} flagged ${String(m.flagged).padStart(2)}  P ${m.precision.toFixed(3)}  R ${m.recall.toFixed(3)}  F1 ${m.f1.toFixed(3)}  CI ${m.f1_ci95_by_seed[0].join('-')}  dF1 ${m.delta_f1_vs_text_changed_ci95_by_seed[0].join('..')}`);
}
