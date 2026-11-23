export type RequestStep = 'property'|'heating'|'envelope'|'documents'|'review';
export const REQUEST_STEPS: RequestStep[]=['property','heating','envelope','documents','review'];
export const STEP_LABELS: Record<RequestStep,string>={
 property:'Immobile',heating:'Impianto',envelope:'Involucro',documents:'Documenti',review:'Riepilogo'
};
export function validateProperty(input:{address:string;city:string;region:string;floorAreaM2?:number}) {
 const missing=['address','city','region'].filter(key=>!String(input[key as 'address'|'city'|'region']||'').trim());
 if(input.floorAreaM2!==undefined && (!Number.isFinite(input.floorAreaM2)||input.floorAreaM2<=0)) missing.push('floorAreaM2');
 return missing;
}
