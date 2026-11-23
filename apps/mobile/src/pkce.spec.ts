import { describe,expect,it } from 'vitest';
import { base64Url,createVerifier,buildAuthorizeUrl } from './pkce';
describe('PKCE helpers',()=>{
 it('encodes base64url without padding',()=>expect(base64Url(new Uint8Array([255,254,253]))).toBe('__79'));
 it('requires strong random input',()=>expect(()=>createVerifier(new Uint8Array(8))).toThrow());
 it('produces a 43 character verifier from 32 bytes',()=>expect(createVerifier(new Uint8Array(32)).length).toBe(43));
 it('builds S256 authorization request',()=>{
  const url=new URL(buildAuthorizeUrl({authorizationEndpoint:'https://id.example.test/authorize',clientId:'mobile',redirectUri:'apeitalia://auth/callback',audience:'ape-italia-api'},{challenge:'challenge',state:'state',nonce:'nonce'}));
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('response_type')).toBe('code');
  expect(url.searchParams.get('state')).toBe('state');
 });
 it('rejects insecure authorization endpoint',()=>expect(()=>buildAuthorizeUrl({authorizationEndpoint:'http://bad.test',clientId:'x',redirectUri:'apeitalia://auth/callback',audience:'x'},{challenge:'x',state:'x',nonce:'x'})).toThrow());
});
