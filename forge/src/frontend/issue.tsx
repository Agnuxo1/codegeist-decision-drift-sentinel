// Copyright (c) 2026 Francisco Angulo de Lafuente. MIT. ORCID0009-0001-1634-7063.
import React,{useEffect,useRef,useState} from 'react';
import ForgeReconciler,{Button,Heading,Inline,Label,SectionMessage,Select,Spinner,Stack,Text,Textfield,useProductContext} from '@forge/react';
import {call,CitationList,Preview,Review} from './api';

const verdicts = {
  UNCHANGED:'Quoted text unchanged',
  EDITORIAL_ONLY:'Text changed; no tracked fact difference',
  REVIEW_MATERIAL:'Tracked facts changed — review needed',
  REVIEW_NOT_FOUND:'Citation could not be located',
};
function App() {
  const context = useProductContext();
  const issueId = context?.extension?.issue?.id;
  const epoch = useRef(0);
  const [source,setSource]=useState('');
  const [preview,setPreview]=useState<Preview|null>(null);
  const [selected,setSelected]=useState('');
  const [saved,setSaved]=useState<CitationList>({items:[],nextCursor:null});
  const [review,setReview]=useState<Review|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    const token=++epoch.current; let cancelled=false;
    setSource('');setPreview(null);setSelected('');setReview(null);
    setSaved({items:[],nextCursor:null});setError('');
    if (!issueId) return;
    setBusy(true);
    call<CitationList>('list').then(data=>{if(!cancelled&&epoch.current===token)setSaved(data);})
      .catch(e=>{if(!cancelled&&epoch.current===token)setError(e instanceof Error?e.message:'Unable to load citations.');})
      .finally(()=>{if(!cancelled&&epoch.current===token)setBusy(false);});
    return()=>{cancelled=true;};
  },[issueId]);
  async function act<T>(work:()=>Promise<T>,apply:(data:T)=>void) {
    const token=epoch.current;setBusy(true);setError('');setReview(null);
    try {const value=await work();if(epoch.current===token)apply(value);}
    catch(e){if(epoch.current===token){setSaved({items:[],nextCursor:null});setError(e instanceof Error?e.message:'The review is unavailable.');}}
    finally{if(epoch.current===token)setBusy(false);}
  }
  const chosen=preview?.paragraphs.find(p=>String(p.ordinal)===selected);
  function loadSource() {
    setPreview(null);setSelected('');
    void act(()=>call<Preview>('preview',{source}),data=>{
      setPreview(data);setSelected(data.paragraphs[0]?String(data.paragraphs[0].ordinal):'');
    });
  }
  function capture() {
    if(!preview||!chosen)return;
    const requestId=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
    void act(async()=>{
      const item=await call<{id:string}>('capture',{pageId:preview.pageId,version:preview.version,
        ordinal:chosen.ordinal,digest:chosen.digest,requestId});
      const [list,result]=await Promise.all([call<CitationList>('list'),call<Review>('review',{id:item.id})]);
      return {list,result};
    },data=>{setSaved(data.list);setReview(data.result);setPreview(null);setSelected('');});
  }
  if(!context)return <Spinner label="Loading issue context"/>;
  if(!issueId)return <SectionMessage title="Open a Jira issue" appearance="information"><Text>This panel reviews evidence linked to an issue.</Text></SectionMessage>;
  return <Stack space="space.200">
    <Heading as="h2">Decision Drift Sentinel</Heading>
    <Text>Keep a decision connected to the policy evidence that supported it.</Text>
    {error&&<SectionMessage title="Review not completed" appearance="warning"><Text>{error}</Text></SectionMessage>}
    <Heading as="h3">Link cited evidence</Heading>
    <Label labelFor="source-page">Confluence page URL or page ID</Label>
    <Textfield id="source-page" value={source} onChange={e=>setSource((e.target as HTMLInputElement).value)}
      isDisabled={busy} placeholder="Paste a page from this Atlassian site"/>
    <Button appearance="primary" isDisabled={busy||!source.trim()} onClick={loadSource}>Load source</Button>
    {preview&&<Stack space="space.150">
      <Text>{preview.title+' · version '+preview.version}</Text>
      <Label labelFor="source-evidence">Paragraph supporting this decision</Label>
      <Select inputId="source-evidence" isMulti={false} isDisabled={busy}
        options={preview.paragraphs.map(p=>({value:String(p.ordinal),label:p.ordinal+'. '+p.text.slice(0,110)}))}
        value={chosen?{value:String(chosen.ordinal),label:chosen.ordinal+'. '+chosen.text.slice(0,110)}:null}
        onChange={value=>setSelected((value as {value:string}|null)?.value||'')}/>
      {chosen&&<Text>{chosen.text}</Text>}
      <Text>The page version and this quotation will be saved together. New captures preserve earlier evidence.</Text>
      <Button appearance="primary" isDisabled={busy||!chosen} onClick={capture}>Save cited evidence</Button>
    </Stack>}
    <Heading as="h3">Saved evidence</Heading>
    <Button isDisabled={busy} onClick={()=>void act(()=>call<CitationList>('list'),setSaved)}>Refresh citations</Button>
    {!saved.items.length&&!busy&&<Text>No accessible citations are saved on this issue yet.</Text>}
    {saved.items.map(item=><Inline key={item.id} space="space.100" alignBlock="center">
      <Text>{item.title+' · captured v'+item.version+' · current v'+item.pageVersion}</Text>
      <Button isDisabled={busy} onClick={()=>void act(()=>call<Review>('review',{id:item.id}),setReview)}>Review latest</Button>
    </Inline>)}
    {saved.nextCursor&&<Button isDisabled={busy} onClick={()=>void act(()=>call<CitationList>('list',{cursor:saved.nextCursor}),setSaved)}>Next citations</Button>}
    {review&&<Stack space="space.150">
      <SectionMessage title={verdicts[review.verdict]} appearance={review.needsReview?'warning':'information'}>
        <Text>{review.title+' · captured v'+review.capturedVersion+' → current v'+review.currentVersion}</Text>
        {review.pageVersionChanged&&<Text>The source page was updated. Changes outside this quotation may also affect the decision.</Text>}
      </SectionMessage>
      <Heading as="h3">Captured quotation</Heading><Text>{review.originalQuote}</Text>
      <Heading as="h3">Closest current passage</Heading>
      <Text>{review.successor?.text||'No sufficiently similar passage was located. Inspect the source manually.'}</Text>
      {!!review.factsRemoved.length&&<Text>{'Tracked facts removed: '+review.factsRemoved.join(', ')}</Text>}
      {!!review.factsAdded.length&&<Text>{'Tracked facts added: '+review.factsAdded.join(', ')}</Text>}
      <Text>{'Captured '+new Date(review.capturedAt).toLocaleString()}</Text>
    </Stack>}
    {busy&&<Spinner label="Checking cited evidence"/>}
    <Text>Review assistance for textual excerpts. This does not certify legal compliance or prove that a decision remains valid.</Text>
    <Text>Francisco Angulo de Lafuente · Decision Drift Sentinel</Text>
  </Stack>;
}
ForgeReconciler.render(<React.StrictMode><App/></React.StrictMode>);
