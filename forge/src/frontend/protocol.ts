// Accept the documented Forge Bridge direct or metadata-wrapped resolver response.
const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function unwrap<T>(raw:unknown):T {
  const value=record(raw)&&!('ok'in raw)&&'body'in raw?raw.body:raw;
  if(!record(value)||typeof value.ok!=='boolean')throw new Error('The review service is unavailable.');
  if(!value.ok) {
    const error=record(value.error)?value.error:null;
    throw new Error(typeof error?.message==='string'&&error.message.length<=1000
      ?error.message:'The review could not be completed.');
  }
  if(!('data'in value))throw new Error('The review service returned an incomplete result.');
  return value.data as T;
}
