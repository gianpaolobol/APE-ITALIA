import { describe, expect, it } from 'vitest';
import { submitApeRequest } from './submit-request';
describe('APE request submission',()=>{
 it('rejects missing fields before network calls',async()=>{
  await expect(submitApeRequest(null,{address:'',city:'',region:''})).rejects.toThrow('Campi non validi');
 });
 it('requires a verified session before network calls',async()=>{
  await expect(submitApeRequest(null,{address:'Via Roma 1',city:'Bologna',region:'Emilia-Romagna'})).rejects.toThrow('Accedi');
 });
});
