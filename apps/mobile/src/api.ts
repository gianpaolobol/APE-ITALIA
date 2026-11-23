export type PropertyInput = { address: string; city: string; region: string; floorAreaM2?: number };
export type PropertyRecord = PropertyInput & { id: string; organizationId: string; createdAt: string };
export type CaseRecord = { id: string; propertyId: string; organizationId: string; status: string; createdAt: string };
export type ApiSession = { apiBaseUrl: string; accessToken: string; organizationId: string };
export type MembershipInfo = { organizationId: string; organizationName: string; role: string };
export type MeResponse = { subject: string; memberships: MembershipInfo[] };
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); this.name='ApiError'; } }
export class ApeApi {
 constructor(private readonly session: ApiSession) {}
 private async request<T>(path: string, method: 'GET'|'POST'='GET', body?: unknown): Promise<T> {
  const {apiBaseUrl,accessToken,organizationId}=this.session;
  if (!/^https:\/\//.test(apiBaseUrl)) throw new Error('HTTPS API required');
  const res=await fetch(apiBaseUrl.replace(/\/$/,'')+'/v1/'+path,{
   method,
   headers:{'Authorization':'Bearer '+accessToken,'x-organization-id':organizationId,'Content-Type':'application/json'},
   ...(body === undefined ? {} : {body:JSON.stringify(body)})
  });
  if(!res.ok) throw new ApiError(res.status, res.status===401?'Sessione non valida':res.status===403?'Accesso negato':'Errore API '+res.status);
  return res.json() as Promise<T>;
 }
 listProperties(){return this.request<PropertyRecord[]>('properties');}
 createProperty(input:PropertyInput){return this.request<PropertyRecord>('properties','POST',input);}
 listCases(){return this.request<CaseRecord[]>('cases');}
 createCase(propertyId:string){return this.request<CaseRecord>('cases','POST',{propertyId});}
}

/** Identity endpoint: requires only the bearer token; the API derives memberships from its database. */
export async function fetchMe(apiBaseUrl: string, accessToken: string): Promise<MeResponse> {
 if (!/^https:\/\//.test(apiBaseUrl)) throw new Error('HTTPS API required');
 const res=await fetch(apiBaseUrl.replace(/\/$/,'')+'/v1/me',{method:'GET',headers:{'Authorization':'Bearer '+accessToken}});
 if(!res.ok) throw new ApiError(res.status, res.status===401?'Sessione non valida':'Errore API '+res.status);
 return res.json() as Promise<MeResponse>;
}
