import { describe, expect, it, vi, afterEach } from 'vitest';
import { submitApeRequest } from './submit-request';
const session={apiBaseUrl:'https://api.example.test',accessToken:'synthetic-test-token',organizationId:'tenant-test'};
afterEach(()=>vi.unstubAllGlobals());
describe('request submission sequence',()=>{
 it('creates a property then a case for its returned ID',async()=>{
  const calls:string[]=[];
  vi.stubGlobal('fetch',vi.fn(async (url:string,init:any)=>{
   calls.push(url);
   if(url.endsWith('/properties')) return {ok:true,json:async()=>({id:'property-test-id'})};
   if(url.endsWith('/cases')){
    expect(JSON.parse(init.body)).toEqual({propertyId:'property-test-id'});
    return {ok:true,json:async()=>({id:'case-test-id',propertyId:'property-test-id'})};
   }
   throw new Error('Unexpected endpoint');
  }));
  const result=await submitApeRequest(session,{address:'Via Prova 1',city:'Bologna',region:'Emilia-Romagna'});
  expect(result.id).toBe('case-test-id');
  expect(calls).toEqual(['https://api.example.test/v1/properties','https://api.example.test/v1/cases']);
 });
 it('does not create a case if property creation fails',async()=>{
  const fetchMock=vi.fn().mockResolvedValue({ok:false,status:403});
  vi.stubGlobal('fetch',fetchMock);
  await expect(submitApeRequest(session,{address:'Via Prova 1',city:'Bologna',region:'Emilia-Romagna'})).rejects.toMatchObject({status:403});
  expect(fetchMock).toHaveBeenCalledTimes(1);
 });
});
