// SPDX-FileCopyrightText: 2026 Francisco Angulo de Lafuente
// SPDX-License-Identifier: MIT
// Research-Project: Decision Drift Sentinel
// Research-Date: 2026-11-04
// Research-ORCID: https://orcid.org/0009-0001-1634-7063
// Reuse: Preserve the MIT notice and cite the project author.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  classifyCitation, factsModal, factsV1, findSuccessor, levenshtein, metrics, normalizedDistance,
} from '../src/core/drift.js';

const fixture = JSON.parse(readFileSync(new URL('../bench/fixtures/cfr200_benchmark.json', import.meta.url), 'utf8'));
const bySection = new Map();
for (const p of fixture.paragraphs) {
  if (!bySection.has(p.section)) bySection.set(p.section, []);
  bySection.get(p.section).push({ ordinal: p.ordinal, text: p.text });
}

test('levenshtein: textbook cases and symmetry', () => {
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.equal(levenshtein('', 'abc'), 3);
  assert.equal(levenshtein('abc', ''), 3);
  assert.equal(levenshtein('flaw', 'lawn'), 2);
  assert.equal(levenshtein('§ 200.1', '§ 200.1'), 0);
  assert.equal(levenshtein('ab', 'ba'), levenshtein('ba', 'ab'));
  assert.equal(normalizedDistance('ABC', 'abc'), 0);
});

test('facts: numbers without section references, obligation words, modals', () => {
  assert.deepEqual(factsV1('Under § 200.313(a) equipment of $5,000 or more must be tracked for 3 years.'),
    ['$5,000'.slice(1), '3', 'must', 'years'].sort());
  assert.deepEqual(factsV1('Costs are unallowable without prior written approval.'), ['prior written approval', 'unallowable']);
  assert.deepEqual(factsV1('The recipient must not exceed 10 percent.'), ['10', 'must not', 'percent']);
  assert.deepEqual(factsModal('The agency will review and can reject it.'), ['can', 'will']);
  assert.deepEqual(factsV1(null), []);
});

test('classifyCitation: the four verdicts', () => {
  const page = [
    { ordinal: 1, text: 'Equipment means property with a per-unit cost of $10,000 or more.' },
    { ordinal: 2, text: 'Records must be retained for three years.' },
  ];
  assert.equal(classifyCitation('Records must be retained for three years.', page).verdict, 'UNCHANGED');
  assert.equal(classifyCitation('Records must be kept for three years.', page).verdict, 'EDITORIAL_ONLY');
  const material = classifyCitation('Equipment means property with a per-unit cost of $5,000 or more.', page);
  assert.equal(material.verdict, 'REVIEW_MATERIAL');
  assert.deepEqual(material.factsRemoved, ['5,000']);
  assert.deepEqual(material.factsAdded, ['10,000']);
  assert.equal(material.successor.ordinal, 1);
  assert.equal(classifyCitation('Travel is reimbursed at cost.', page).verdict, 'REVIEW_NOT_FOUND');
  assert.equal(classifyCitation('Anything at all.', []).verdict, 'REVIEW_NOT_FOUND');
});

test('findSuccessor: ties go to the lower ordinal', () => {
  const best = findSuccessor('abc', [{ ordinal: 7, text: 'abd' }, { ordinal: 3, text: 'abe' }]);
  assert.equal(best.passage.ordinal, 3);
});

test('metrics: precision, recall, F1', () => {
  assert.deepEqual(metrics([true, true, false, false], [true, false, true, false]),
    { tp: 1, fp: 1, fn: 1, precision: 0.5, recall: 0.5, f1: 0.5, flagged: 2 });
});

for (const [variant, options] of [
  ['v1', { facts: factsV1 }],
  ['modal_v2', { facts: factsModal }],
  ['distance_045', { facts: factsV1, maxDistance: 0.45 }],
]) {
  test(`parity with the Python reference on 48 real 2 CFR 200 cases: ${variant}`, () => {
    let same = 0;
    for (const c of fixture.cases) {
      const ref = c.reference[variant];
      const got = classifyCitation(c.cited_text, bySection.get(c.section) || [], options);
      assert.equal(got.verdict, ref.verdict, `${c.id} ${variant}`);
      if (ref.distance === null) assert.equal(got.distance, null, c.id);
      else assert.ok(Math.abs(got.distance - ref.distance) < 5e-5, `${c.id} distance ${got.distance} vs ${ref.distance}`);
      same++;
    }
    assert.equal(same, 48);
  });
}

test('fact extraction parity with Python on every cited passage', () => {
  for (const c of fixture.cases) {
    assert.deepEqual(factsV1(c.cited_text), c.facts_v1, c.id);
    assert.deepEqual(factsModal(c.cited_text), c.facts_modal_v2, c.id);
  }
});
