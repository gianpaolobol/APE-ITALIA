import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApeApi } from './api';
const session={apiBaseUrl:'https://api.example.test',accessToken:'synthetic-test-token',organizationId:'tenant-test'};
afterEach(()=>vi.unstubAllGlobals());
describe('ApeApi transport',()=>{
 it('refuses insecure HTTP before network',async()=>{
  const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
  await expect(new ApeApi({...session,apiBaseUrl:'http://insecure.test'}).listProperties()).rejects.toThrow('HTTPS');
  expect(fetchMock).not.toHaveBeenCalled();
 });
 it('sends bearer token and organization to API',async()=>{
  const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>[]});vi.stubGlobal('fetch',fetchMock);
  await new ApeApi(session).listProperties();
  expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/v1/properties',expect.objectContaining({
   method:'GET',headers:expect.objectContaining({'Authorization':'Bearer synthetic-test-token','x-organization-id':'tenant-test'})
  }));
 });
 it('reports 401 without exposing response contents',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:401}));
  await expect(new ApeApi(session).listCases()).rejects.toMatchObject({status:401,message:'Sessione non valida'});
 });
 it('sends property payload to API',async()=>{
  const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({id:'p1'})});vi.stubGlobal('fetch',fetchMock);
  await new ApeApi(session).createProperty({address:'Via prova',city:'Bologna',region:'Emilia-Romagna'});
  expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/v1/properties',expect.objectContaining({
   method:'POST',body:JSON.stringify({address:'Via prova',city:'Bologna',region:'Emilia-Romagna'})
  }));
 });
});
