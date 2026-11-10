// Copyright (c) 2026 Francisco Angulo de Lafuente. MIT. ORCID0009-0001-1634-7063.
import React,{useEffect,useState} from 'react';
import ForgeReconciler,{Heading,SectionMessage,Spinner,Stack,Text,useProductContext} from '@forge/react';
import {call} from './api';
function App() {
  const context=useProductContext();
  const pageId=context?.extension?.content?.id;
  const [info,setInfo]=useState<{pageId:string;title:string;version:number;paragraphs:number}|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;setInfo(null);setError('');
    if(!pageId)return;
    call<{pageId:string;title:string;version:number;paragraphs:number}>('sourceInfo')
      .then(data=>{if(active)setInfo(data);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'This source is unavailable.');});
    return()=>{active=false;};
  },[pageId]);
  if(error)return <SectionMessage title="Manual source review needed" appearance="warning"><Text>{error}</Text></SectionMessage>;
  if(!info)return <Spinner label="Reading source version"/>;
  return <Stack space="space.150">
    <Heading as="h3">Decision Drift Source</Heading>
    <Text>{info.title+' · version '+info.version}</Text>
    <Text>Open a Jira issue, choose Decision Drift Sentinel and paste this page URL or its identifier to capture the evidence supporting that decision.</Text>
    <Text>{'Page ID: '+info.pageId}</Text>
    <Text>Capturing evidence records its quotation and version. Review the saved citation again after this page changes.</Text>
    <Text>Textual review assistance · Francisco Angulo de Lafuente</Text>
  </Stack>;
}
ForgeReconciler.render(<React.StrictMode><App/></React.StrictMode>);
