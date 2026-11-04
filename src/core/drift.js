// SPDX-FileCopyrightText: 2026 Francisco Angulo de Lafuente
// SPDX-License-Identifier: MIT
// Research-Project: Decision Drift Sentinel
// Research-Date: 2026-11-04
// Research-ORCID: https://orcid.org/0009-0001-1634-7063
// Reuse: Preserve the MIT notice and cite the project author.

// @ts-check
/**
 * Decision Drift Sentinel — deterministic core.
 *
 * Port of the Regulation Change Sentinel decision rule
 * (github.com/Agnuxo1/zetaris-regulation-change-sentinel, src/control_direct.py and
 * src/control_modal_v2.py). For a decision that quotes a source passage, find the
 * passage's successor in the new version of the source, compare the facts both
 * versions state, and return one of four verdicts with the evidence:
 *
 *   UNCHANGED         the quoted passage is still there, character for character
 *   EDITORIAL_ONLY    a successor exists and states exactly the same facts
 *   REVIEW_MATERIAL   a successor exists but its facts differ
 *   REVIEW_NOT_FOUND  no passage of the new version is close enough
 *
 * No network, no model, no randomness: the same input always gives the same output.
 */

export const VERDICTS = Object.freeze(['UNCHANGED', 'EDITORIAL_ONLY', 'REVIEW_MATERIAL', 'REVIEW_NOT_FOUND']);
export const DEFAULT_MAX_DISTANCE = 0.6;

const STRIP = /(§+ ?[0-9.]+|part [0-9]+|\([a-z0-9]+\))/g;
const NUM = /([0-9][0-9,.]*[0-9]|[0-9])/g;
const WORDS = /\b(must not|may not|must|may|should|shall|unallowable|allowable|prior written approval|prior approval|required|prohibited|percent|calendar days|months|years)\b/g;
const MODALS = /\b(?:will|can)\b/g;

/** @param {string[]} items */
const sortedUnique = items => [...new Set(items)].sort();

/**
 * Facts of the v1 rule: numbers (after removing section, part and paragraph
 * references) and obligation or duration words.
 * @param {string | null | undefined} text
 * @returns {string[]}
 */
export function factsV1(text) {
  const low = (text || '').toLowerCase();
  const nums = [...low.replace(STRIP, ' ').matchAll(NUM)].map(m => m[1]);
  const words = [...low.matchAll(WORDS)].map(m => m[1]);
  return sortedUnique([...nums, ...words]);
}

/**
 * Facts of the modal v2 rule: v1 facts plus the modals `will` and `can`.
 * @param {string | null | undefined} text
 * @returns {string[]}
 */
export function factsModal(text) {
  const low = (text || '').toLowerCase();
  return sortedUnique([...factsV1(text), ...[...low.matchAll(MODALS)].map(m => m[0])]);
}

export const FACT_EXTRACTORS = Object.freeze({ v1: factsV1, modal_v2: factsModal });

/**
 * Levenshtein edit distance over Unicode code points (insert, delete, substitute = 1),
 * matching rapidfuzz.distance.Levenshtein.distance on Python strings.
 * @param {string} a
 * @param {string} b
 */
export function levenshtein(a, b) {
  const s = Array.from(a);
  const t = Array.from(b);
  if (s.length < t.length) return levenshteinCodes(t, s);
  return levenshteinCodes(s, t);
}

/** @param {string[]} s longer @param {string[]} t shorter */
function levenshteinCodes(s, t) {
  const m = t.length;
  if (m === 0) return s.length;
  let prev = new Uint32Array(m + 1);
  let cur = new Uint32Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= s.length; i++) {
    cur[0] = i;
    const si = s[i - 1];
    for (let j = 1; j <= m; j++) {
      const sub = prev[j - 1] + (si === t[j - 1] ? 0 : 1);
      const del = prev[j] + 1;
      const ins = cur[j - 1] + 1;
      cur[j] = sub < del ? (sub < ins ? sub : ins) : (del < ins ? del : ins);
    }
    const tmp = prev; prev = cur; cur = tmp;
  }
  return prev[m];
}

/**
 * Distance normalised by the longer of the two original strings, as in the reference.
 * @param {string} a
 * @param {string} b
 */
export function normalizedDistance(a, b) {
  const len = Math.max(Array.from(a).length, Array.from(b).length);
  if (len === 0) return 0;
  return levenshtein(a.toLowerCase(), b.toLowerCase()) / len;
}

/**
 * @typedef {{ ordinal: number, text: string }} Passage
 * @typedef {{
 *   verdict: 'UNCHANGED' | 'EDITORIAL_ONLY' | 'REVIEW_MATERIAL' | 'REVIEW_NOT_FOUND',
 *   distance: number | null,
 *   successor: Passage | null,
 *   factsBefore: string[],
 *   factsAfter: string[],
 *   factsRemoved: string[],
 *   factsAdded: string[],
 *   needsReview: boolean
 * }} DriftResult
 */

/**
 * Closest passage by (normalised distance, ordinal), the tie-break of the reference.
 * @param {string} cited
 * @param {Passage[]} passages
 * @returns {{ passage: Passage, distance: number } | null}
 */
export function findSuccessor(cited, passages) {
  /** @type {{ passage: Passage, distance: number } | null} */
  let best = null;
  for (const p of passages) {
    const d = normalizedDistance(cited, p.text);
    if (best === null || d < best.distance || (d === best.distance && p.ordinal < best.passage.ordinal)) {
      best = { passage: p, distance: d };
    }
  }
  return best;
}

/**
 * Classify one quoted passage against the passages of the new source version.
 * @param {string} cited the passage the decision relied on
 * @param {Passage[]} passages candidate successors (same section or page)
 * @param {{ facts?: (text: string) => string[], maxDistance?: number }} [options]
 * @returns {DriftResult}
 */
export function classifyCitation(cited, passages, options = {}) {
  const facts = options.facts || factsModal;
  const maxDistance = options.maxDistance ?? DEFAULT_MAX_DISTANCE;
  const best = findSuccessor(cited, passages);
  const distance = best ? best.distance : null;
  const factsBefore = facts(cited);
  const factsAfter = facts(best ? best.passage.text : '');
  const after = new Set(factsAfter);
  const before = new Set(factsBefore);
  const factsRemoved = factsBefore.filter(f => !after.has(f));
  const factsAdded = factsAfter.filter(f => !before.has(f));
  /** @type {DriftResult['verdict']} */
  let verdict;
  if (distance === 0) verdict = 'UNCHANGED';
  else if (distance === null || distance > maxDistance) verdict = 'REVIEW_NOT_FOUND';
  else if (factsRemoved.length || factsAdded.length) verdict = 'REVIEW_MATERIAL';
  else verdict = 'EDITORIAL_ONLY';
  return {
    verdict,
    distance,
    successor: best && verdict !== 'REVIEW_NOT_FOUND' ? best.passage : null,
    factsBefore,
    factsAfter,
    factsRemoved,
    factsAdded,
    needsReview: verdict.startsWith('REVIEW'),
  };
}

/**
 * Binary detection metrics (positive = sent to review, truth = material change).
 * @param {boolean[]} truth
 * @param {boolean[]} predicted
 */
export function metrics(truth, predicted) {
  let tp = 0, fp = 0, fn = 0;
  for (let i = 0; i < truth.length; i++) {
    if (truth[i] && predicted[i]) tp++;
    else if (!truth[i] && predicted[i]) fp++;
    else if (truth[i] && !predicted[i]) fn++;
  }
  return {
    tp, fp, fn,
    precision: tp + fp ? tp / (tp + fp) : 0,
    recall: tp + fn ? tp / (tp + fn) : 0,
    f1: 2 * tp + fp + fn ? (2 * tp) / (2 * tp + fp + fn) : 0,
    flagged: predicted.filter(Boolean).length,
  };
}
