// Copyright (c) 2026 Francisco Angulo de Lafuente. MIT.
// ORCID: https://orcid.org/0009-0001-1634-7063
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { classifyCitation, factsModal } from './core/drift.js';

export class ReviewError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const problem = (code, message) => { throw new ReviewError(code, message); };
export const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
export function numericId(value) {
  const id = String(value ?? '');
  if (!/^[1-9]\d{0,19}$/.test(id)) problem('INVALID_ID', 'Enter a valid page identifier.');
  return id;
}
export function pageIdFromInput(value, siteOrigin) {
  if (typeof value !== 'string' || value.length > 2048) problem('INVALID_SOURCE', 'Enter a page URL or identifier.');
  const raw = value.trim();
  if (/^[1-9]\d{0,19}$/.test(raw)) return numericId(raw);
  let url;
  try { url = new URL(raw); } catch { problem('INVALID_SOURCE', 'Enter a Confluence page URL from this site.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.origin !== siteOrigin)
    problem('WRONG_SITE', 'Choose a Confluence page from the same Atlassian site.');
  const match = url.pathname.match(/^\/wiki\/(?:spaces\/[^/]+\/)?pages\/([1-9]\d*)(?:\/|$)/);
  if (match) return numericId(match[1]);
  if (url.pathname === '/wiki/pages/viewpage.action' && url.searchParams.getAll('pageId').length === 1)
    return numericId(url.searchParams.get('pageId'));
  problem('INVALID_SOURCE', 'Enter a Confluence page URL or its page identifier.');
}

// These are conservative coverage bounds, not an approximation of oversized pages.
export function paragraphsFromPage(page) {
  const value = page?.body?.atlas_doc_format?.value;
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 131072)
    problem('SOURCE_UNSUPPORTED', 'This source needs manual review; its document format or size is unsupported.');
  let doc;
  try { doc = JSON.parse(value); } catch { problem('SOURCE_UNSUPPORTED', 'This source needs manual review.'); }
  if (doc?.type !== 'doc' || doc.version !== 1 || !Array.isArray(doc.content))
    problem('SOURCE_UNSUPPORTED', 'This source needs manual review.');
  const paragraphs = []; let nodes = 0; let total = 0;
  const containers = new Set(['doc','bulletList','orderedList','listItem','table','tableRow',
    'tableCell','tableHeader','blockquote','panel','expand','nestedExpand']);
  function text(node, depth) {
    if (++nodes > 5000 || depth > 40) problem('SOURCE_UNSUPPORTED', 'This source needs manual review.');
    if (node?.type === 'text' && typeof node.text === 'string') return node.text;
    if (node?.type === 'hardBreak') return '\n';
    problem('SOURCE_UNSUPPORTED', 'This source contains non-text evidence that needs manual review.');
  }
  function walk(node, depth) {
    if (++nodes > 5000 || depth > 40) problem('SOURCE_UNSUPPORTED', 'This source needs manual review.');
    if (!node || typeof node !== 'object') problem('SOURCE_UNSUPPORTED', 'This source needs manual review.');
    if (['paragraph','heading','codeBlock'].includes(node.type)) {
      if (node.content !== undefined && !Array.isArray(node.content))
        problem('SOURCE_UNSUPPORTED', 'This source needs manual review.');
      const visible = (node.content || []).map(n => text(n, depth + 1)).join('').trim();
      total += visible.length;
      if (visible.length > 800 || total > 40000 || paragraphs.length >= 80)
        problem('SOURCE_UNSUPPORTED', 'This source is too large for automatic excerpt comparison; review it in Confluence.');
      if (visible) paragraphs.push({ordinal: paragraphs.length + 1, text: visible, digest: digest(visible)});
    } else if (containers.has(node.type) && Array.isArray(node.content)) {
      for (const child of node.content) walk(child, depth + 1);
    } else if (node.type !== 'rule') {
      problem('SOURCE_UNSUPPORTED', 'This source contains non-text evidence that needs manual review.');
    }
  }
  walk(doc, 0);
  if (!paragraphs.length) problem('SOURCE_EMPTY', 'Choose a source with a readable text paragraph.');
  return {paragraphs, sourceDigest: digest(value)};
}

function validPage(page, pageId) {
  if (String(page?.id) !== pageId || page.status !== 'current' || !Number.isSafeInteger(page?.version?.number)
      || page.version.number < 1 || typeof page.title !== 'string' || page.title.length > 500)
    problem('SOURCE_UNAVAILABLE', 'The source is not available for review.');
  return page;
}
function validSnapshot(value, issueId) {
  return value && value.issueId === issueId && /^[1-9]\d{0,19}$/.test(value.pageId)
    && typeof value.quote === 'string' && value.quote.length > 0 && value.quote.length <= 800
    && digest(value.quote) === value.quoteDigest && /^[a-f0-9]{64}$/.test(value.sourceDigest)
    && Number.isSafeInteger(value.version) && value.version > 0
    && typeof value.capturedAt === 'string' && value.capturedAt.length <= 32;
}

export function createReviewService(deps) {
  async function scope(context, needsEdit = false) {
    const id = numericId(context?.extension?.issue?.id);
    // authorizeIssue must call the Jira API as the invoking user, never asApp.
    const verified = await deps.authorizeIssue(id, needsEdit);
    if (verified.issueId !== id || new URL(verified.siteOrigin).protocol !== 'https:')
      problem('ISSUE_UNAVAILABLE', 'This Jira issue is not available.');
    if (needsEdit && verified.canEdit !== true)
      problem('ISSUE_EDIT_REQUIRED', 'You need permission to edit this Jira issue before capturing evidence.');
    return {issueId: id, siteOrigin: new URL(verified.siteOrigin).origin};
  }
  async function page(pageId, body = true) {
    return validPage(await deps.getPage(pageId, body), pageId);
  }
  function citationKey(issueId, id) {
    if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id))
      problem('INVALID_CITATION', 'Choose a saved citation.');
    return `citation:${issueId}:${id}`;
  }
  return {
    async preview(context, payload) {
      const {siteOrigin} = await scope(context);
      const pageId = pageIdFromInput(payload?.source, siteOrigin);
      const current = await page(pageId);
      return {pageId, title: current.title, version: current.version.number, ...paragraphsFromPage(current)};
    },
    async capture(context, payload) {
      const {issueId} = await scope(context, true);
      const pageId = numericId(payload?.pageId);
      if (!Number.isSafeInteger(payload?.version) || !Number.isSafeInteger(payload?.ordinal)
          || typeof payload?.digest !== 'string' || !/^[a-f0-9]{64}$/.test(payload.digest)
          || typeof payload?.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(payload.requestId))
        problem('INVALID_CAPTURE', 'Reload the source and select its evidence again.');
      const current = await page(pageId);
      const parsed = paragraphsFromPage(current);
      const paragraph = parsed.paragraphs.find(p => p.ordinal === payload.ordinal);
      if (current.version.number !== payload.version || !paragraph || paragraph.digest !== payload.digest)
        problem('SOURCE_CHANGED', 'The source changed. Reload it and select the evidence again.');
      const id = digest(JSON.stringify([issueId, pageId, payload.version, payload.ordinal, payload.digest, payload.requestId]));
      const key = citationKey(issueId, id);
      const snapshot = {issueId, pageId, title: current.title, version: current.version.number,
        ordinal: paragraph.ordinal, quote: paragraph.text, quoteDigest: paragraph.digest,
        sourceDigest: parsed.sourceDigest, capturedAt: deps.now()};
      function winnerResult(existing) {
        const boundFields = ['issueId','pageId','title','version','ordinal','quote','quoteDigest','sourceDigest'];
        if (!validSnapshot(existing, issueId) || !boundFields.every(field => existing[field] === snapshot[field]))
          problem('INVALID_CITATION', 'This citation needs manual review.');
        return {id, capturedAt: existing.capturedAt, alreadySaved: true};
      }
      const existing = await deps.get(key);
      if (existing !== undefined) return winnerResult(existing);
      // create must be an atomic FAIL_IF_EXISTS operation, not get followed by an unconditional set.
      try { await deps.create(key, snapshot); }
      catch (error) {
        const winner = await deps.get(key);
        if (winner === undefined) throw error;
        return winnerResult(winner);
      }
      return {id, capturedAt: snapshot.capturedAt, alreadySaved: false};
    },
    async list(context, payload) {
      const {issueId} = await scope(context);
      const cursor = payload?.cursor;
      if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 2048))
        problem('INVALID_CURSOR', 'Reload the citation list.');
      const batch = await deps.query(`citation:${issueId}:`, cursor);
      if (!Array.isArray(batch.results) || batch.results.length > 20)
        problem('UNAVAILABLE', 'The citation list is temporarily unavailable.');
      const items = [];
      for (const row of batch.results) {
        const id = String(row.key).slice(`citation:${issueId}:`.length);
        if (citationKey(issueId, id) !== row.key || !validSnapshot(row.value, issueId)) continue;
        try {
          // Permission is rechecked before returning even the saved source title or preview.
          const current = await page(row.value.pageId, false);
          items.push({id, title: current.title, version: row.value.version,
            capturedAt: row.value.capturedAt, pageVersion: current.version.number});
        } catch (error) {
          if (!(error instanceof ReviewError)) throw error;
          // Do not reveal saved content or source metadata after access is revoked.
        }
      }
      return {items: items.sort((a,b) => b.capturedAt.localeCompare(a.capturedAt)), nextCursor: batch.nextCursor || null};
    },
    async review(context, payload) {
      const {issueId} = await scope(context);
      const snapshot = await deps.get(citationKey(issueId, payload?.id));
      if (!validSnapshot(snapshot, issueId)) problem('INVALID_CITATION', 'This citation is not available.');
      const current = await page(snapshot.pageId);
      if (current.version.number < snapshot.version)
        problem('SOURCE_CHANGED', 'An earlier source version was returned. Refresh or inspect the source manually.');
      const {paragraphs, sourceDigest} = paragraphsFromPage(current);
      const comparison = classifyCitation(snapshot.quote, paragraphs, {facts: factsModal});
      return {id: payload.id, title: current.title, pageId: snapshot.pageId,
        capturedVersion: snapshot.version, currentVersion: current.version.number,
        capturedAt: snapshot.capturedAt, originalQuote: snapshot.quote,
        pageVersionChanged: current.version.number !== snapshot.version,
        sourceDocumentChanged: sourceDigest !== snapshot.sourceDigest, rule: 'modal_v2', ...comparison};
    },
    async sourceInfo(context) {
      const pageId = numericId(context?.extension?.content?.id);
      const current = await page(pageId);
      const {paragraphs} = paragraphsFromPage(current);
      return {pageId, title: current.title, version: current.version.number, paragraphs: paragraphs.length};
    },
  };
}
