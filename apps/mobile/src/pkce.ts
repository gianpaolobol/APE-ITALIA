/** PKCE S256 utilities. Requires a cryptographically secure RNG supplied by the platform. */
export function base64Url(bytes: Uint8Array): string {
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
 let result='';
 for(let i=0;i<bytes.length;i+=3){
  const a=bytes[i], b=bytes[i+1], c=bytes[i+2];
  const n=(a<<16)|((b??0)<<8)|(c??0);
  result+=alphabet[(n>>>18)&63]+alphabet[(n>>>12)&63];
  if(i+1<bytes.length)result+=alphabet[(n>>>6)&63];
  if(i+2<bytes.length)result+=alphabet[n&63];
 }
 return result;
}
export function createVerifier(randomBytes: Uint8Array): string {
 if(randomBytes.length<32)throw new Error('At least 32 secure random bytes required');
 return base64Url(randomBytes);
}
export function buildAuthorizeUrl(config:{authorizationEndpoint:string;clientId:string;redirectUri:string;audience:string},params:{challenge:string;state:string;nonce:string}):string {
 const url=new URL(config.authorizationEndpoint);
 if(url.protocol!=='https:')throw new Error('HTTPS authorization endpoint required');
 url.searchParams.set('response_type','code');
 url.searchParams.set('client_id',config.clientId);
 url.searchParams.set('redirect_uri',config.redirectUri);
 url.searchParams.set('scope','openid profile');
 url.searchParams.set('code_challenge',params.challenge);
 url.searchParams.set('code_challenge_method','S256');
 url.searchParams.set('state',params.state);
 url.searchParams.set('nonce',params.nonce);
 url.searchParams.set('audience',config.audience);
 return url.toString();
}
