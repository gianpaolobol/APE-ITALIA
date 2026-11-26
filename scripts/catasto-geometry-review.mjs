// Copyright (c) 2026 Gian Paolo Franceschini. All rights reserved.
// [Codex] Local certifier review only; no API, database, uploads or energy calculation.
import {createHash} from 'node:crypto';
import {inspectGeometryHandoff} from './catasto-v02/packages/workbench/geometry-handoff-consumer.mjs';
import {pathToFileURL} from 'node:url';
const limit=512*1024;
const origin='53d102ae0d32d0806446905a007d6278438f4c39';
export function createCatastoReview(raw){
  if(!Buffer.isBuffer(raw)||raw.length===0||raw.length>limit)throw Error('invalid_input_size');
  const result=inspectGeometryHandoff(new TextDecoder('utf-8',{fatal:true}).decode(raw),'ape-italia');
  if(!result.ok)throw Error(result.error);
  const p=result.preview;
  return {version:'0.1.0',kind:'ape-italia/catasto-geometry-review',verification:'to_verify',
    source:{producer:'catasto-italia',sha256:createHash('sha256').update(raw).digest('hex'),validatorOrigin:origin,
      authenticated:false,sourceCaseReplayed:false},
    caseDigest:p.caseDigest,measuredCount:p.measuredCount,missingCount:p.missingCount,
    units:p.units.map(u=>({unitId:u.unitId,operation:u.operation,identifiers:u.identifiers,
      verification:'to_verify',geometry:u.state==='missing'?null:{coordinateUnit:'mm',contours:u.contours,
        placement:u.placement,calibration:u.calibration,geometricAreaMm2:u.areaMm2,geometricPerimeterMm:u.perimeterMm}})),
    energyCalculationReady:false,official:false,caseAssociationVerified:false,
    warning:'Solo evidenza geometrica diagnostica da revisionare; non superficie energetica utile, volume climatizzato, involucro, stato legittimo o APE.'};
}
async function main(){
  if(process.argv.length!==2)throw Error('stdin_only');
  const chunks=[];let n=0;
  for await(const chunk of process.stdin){n+=chunk.length;if(n>limit)throw Error('invalid_input_size');chunks.push(chunk);}
  process.stdout.write(JSON.stringify(createCatastoReview(Buffer.concat(chunks)),null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{await main();}catch(e){process.stderr.write('Catasto review rejected\n');process.exitCode=1;}
}
