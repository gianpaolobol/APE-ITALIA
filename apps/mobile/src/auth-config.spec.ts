import { describe, expect, it } from 'vitest';
import { validateOidcConfig } from './auth-config';
const valid={issuer:'https://identity.example.test',clientId:'ape-mobile',redirectUri:'apeitalia://auth/callback',audience:'ape-italia-api'};
describe('public OIDC configuration',()=>{
 it('accepts HTTPS issuer and application callback',()=>expect(validateOidcConfig(valid)).toEqual(valid));
 it('rejects insecure issuer',()=>expect(()=>validateOidcConfig({...valid,issuer:'http://identity.test'})).toThrow());
 it('rejects unexpected redirect URI scheme',()=>expect(()=>validateOidcConfig({...valid,redirectUri:'https://evil.test'})).toThrow());
 it('rejects missing client ID',()=>expect(()=>validateOidcConfig({...valid,clientId:''})).toThrow());
});
