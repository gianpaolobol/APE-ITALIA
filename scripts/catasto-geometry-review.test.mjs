// [Codex] Synthetic data only. No certification or case mutation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createCatastoReview} from './catasto-geometry-review.mjs';
const cli=fileURLToPath(new URL('./catasto-geometry-review.mjs',import.meta.url));
function wire(){return {
 version:'0.2.0',kind:'synthetic-building-core-geometry-handoff',producer:'catasto-italia',target:'ape-italia',
 scope:'result-units-only',caseDigest:'a'.repeat(64),
 snapshot:{schemaVersion:'0.1.0',snapshotId:'synthetic',asOf:'2026-01-01',sources:[],units:[
 {id:'u1',identifiers:[{id:'c1',status:'unknown',asOf:'2026-01-01',sourceIds:[],value:null}]},
 {id:'u2',identifiers:[{id:'c2',status:'unknown',asOf:'2026-01-01',sourceIds:[],value:null}]}]},
 operations:[{unitId:'u1',operation:'C'},{unitId:'u2',operation:'V'}],
 assertions:{official:false,cadastralApproval:false,buildingCompliance:false,energyCertification:false},
 geometry:[{unitId:'u1',state:'measured',coordinateUnit:'mm',contours:[[[0,0],[4000,0],[4000,2000],[0,2000]]],
 placement:{floor:'P0',xMm:0,yMm:0},calibration:null,areaMm2:'8000000',perimeterMm:'12000'},{unitId:'u2',state:'missing'}],
 geometrySemantics:{axes:'x-right-y-up',contours:'unclosed-orthogonal-disjoint-no-holes',placement:'declared-translation-per-floor-or-null',
 scaleVerified:false,cadastralArea:false,topologyBetweenUnitsVerified:false}};}
function seal(p){return Buffer.from(JSON.stringify({...p,contentDigest:createHash('sha256').update(JSON.stringify(p)).digest('hex')}));}
test('native local review and actual CLI, without promotion to energy inputs',()=>{
 const raw=seal(wire()),out=createCatastoReview(raw);
 assert.equal(out.source.sha256,createHash('sha256').update(raw).digest('hex'));
 assert.equal(out.units[0].geometry.geometricAreaMm2,'8000000');
 assert.equal(out.units[1].geometry,null);
 assert.equal(out.measuredCount,1);assert.equal(out.missingCount,1);
 assert.equal(out.energyCalculationReady,false);assert.equal(out.official,false);assert.equal(out.caseAssociationVerified,false);
 assert.ok(out.units.every(u=>u.verification==='to_verify'));
 assert.equal(Object.hasOwn(out.units[0].geometry,'heatedFloorArea'),false);
 const run=spawnSync(process.execPath,[cli],{input:raw,timeout:10000});
 assert.equal(run.status,0,run.stderr.toString());assert.deepEqual(JSON.parse(run.stdout),out);
});
for(const [name,alter] of [
 ['other recipient',p=>p.target='mpe'],['false official claim',p=>p.assertions.official=true],
 ['resealed forged area',p=>p.geometry[0].areaMm2='1'],['coverage missing',p=>p.geometry.pop()],
 ['unsupported semantics',p=>p.geometrySemantics.cadastralArea=true]
])test(name,()=>{const p=wire();alter(p);assert.throws(()=>createCatastoReview(seal(p)));});
test('malformed, excessive and digest mismatch',()=>{
 for(const raw of [Buffer.from('{'),Buffer.alloc(512*1024+1),Buffer.from([0xff]),Buffer.from(seal(wire()).toString().replace('8000000','9000000'))]){
 assert.throws(()=>createCatastoReview(raw));const run=spawnSync(process.execPath,[cli],{input:raw,timeout:10000});
 assert.notEqual(run.status,0);assert.equal(run.stdout.length,0);}
});
