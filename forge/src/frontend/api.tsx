import { invoke } from '@forge/bridge';
import {unwrap} from './protocol';
export async function call<T>(name:string,payload:Record<string,unknown>={}):Promise<T> {
  return unwrap<T>(await invoke(name,payload));
}
export type Citation = {id:string;title:string;version:number;capturedAt:string;pageVersion:number};
export type CitationList = {items:Citation[];nextCursor:string|null};
export type Preview = {pageId:string;title:string;version:number;paragraphs:{ordinal:number;text:string;digest:string}[]};
export type Review = {
  id:string;title:string;pageId:string;capturedVersion:number;currentVersion:number;
  capturedAt:string;originalQuote:string;pageVersionChanged:boolean;sourceDocumentChanged:boolean;
  verdict:'UNCHANGED'|'EDITORIAL_ONLY'|'REVIEW_MATERIAL'|'REVIEW_NOT_FOUND';
  successor:{ordinal:number;text:string}|null;factsRemoved:string[];factsAdded:string[];needsReview:boolean;
};
