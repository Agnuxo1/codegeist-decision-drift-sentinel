// Copyright (c) 2026 Francisco Angulo de Lafuente. MIT.
// ORCID: https://orcid.org/0009-0001-1634-7063
import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';
import { kvs, WhereConditions } from '@forge/kvs';
import { createReviewService, ReviewError } from './domain.js';

async function jsonResponse(response, code) {
  if (!response.ok) throw new ReviewError(code, 'You cannot access this source or issue, or it is unavailable.');
  try { return await response.json(); }
  catch { throw new ReviewError('UNAVAILABLE', 'The service returned an unreadable response.'); }
}
const service = createReviewService({
  async authorizeIssue(issueId, needsEdit) {
    const issue = await jsonResponse(await api.asUser().requestJira(route`/rest/api/3/issue/${issueId}?fields=summary`), 'ISSUE_UNAVAILABLE');
    const site = await jsonResponse(await api.asUser().requestJira(route`/rest/api/3/serverInfo`), 'ISSUE_UNAVAILABLE');
    let canEdit;
    if (needsEdit) {
      const rights = await jsonResponse(await api.asUser().requestJira(
        route`/rest/api/3/mypermissions?issueId=${issueId}&permissions=EDIT_ISSUES`), 'ISSUE_UNAVAILABLE');
      canEdit = rights?.permissions?.EDIT_ISSUES?.havePermission === true;
    }
    return {issueId: String(issue.id), siteOrigin: new URL(site.baseUrl).origin, canEdit};
  },
  async getPage(id, body) {
    const response = body
      ? await api.asUser().requestConfluence(route`/wiki/api/v2/pages/${id}?body-format=atlas_doc_format`)
      : await api.asUser().requestConfluence(route`/wiki/api/v2/pages/${id}`);
    return jsonResponse(response, 'SOURCE_UNAVAILABLE');
  },
  get: key => kvs.get(key),
  create: (key, value) => kvs.set(key, value, {keyPolicy: 'FAIL_IF_EXISTS'}),
  async query(prefix, cursor) {
    let query = kvs.query().where('key', WhereConditions.beginsWith(prefix)).limit(20);
    if (cursor) query = query.cursor(cursor);
    return query.getMany();
  },
  now: () => new Date().toISOString(),
});
const resolver = new Resolver();
for (const name of ['preview','capture','list','review','sourceInfo']) {
  resolver.define(name, async request => {
    try { return {ok: true, data: await service[name](request.context, request.payload)}; }
    catch (error) {
      // Do not return stack traces, raw API bodies, private page text or credentials.
      return {ok: false, error: error instanceof ReviewError
        ? {code: error.code, message: error.message}
        : {code: 'UNAVAILABLE', message: 'The review could not be completed. Try again or inspect the source manually.'}};
    }
  });
}
export const handler = resolver.getDefinitions();
