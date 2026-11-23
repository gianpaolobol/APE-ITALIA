export type PropertyInput = { address: string; city: string; region: string; floorAreaM2?: number };
export type PropertyRecord = PropertyInput & { id: string; organizationId: string; createdAt: string };
export type CaseRecord = { id: string; propertyId: string; organizationId: string; status: string; createdAt: string };
import type { EvidenceKind, EvidenceRecord, PickedFile } from './evidence';
export type ApiSession = { apiBaseUrl: string; accessToken: string; organizationId: string };
export type MembershipInfo = { organizationId: string; organizationName: string; role: string };
export type MeResponse = { subject: string; memberships: MembershipInfo[] };
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); this.name='ApiError'; } }
const UPLOAD_ERRORS:Record<number,string>={401:'Sessione non valida',403:'Accesso negato o consenso mancante',404:'Pratica non trovata',409:'File già caricato o pratica chiusa',413:'File troppo grande',415:'Formato non accettato',422:'File non valido',503:'Archivio documenti non disponibile'};
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
 private base(){
  const {apiBaseUrl}=this.session;
  if (!/^https:\/\//.test(apiBaseUrl)) throw new Error('HTTPS API required');
  return apiBaseUrl.replace(/\/$/,'')+'/v1/';
 }
 listProperties(){return this.request<PropertyRecord[]>('properties');}
 createProperty(input:PropertyInput){return this.request<PropertyRecord>('properties','POST',input);}
 listCases(){return this.request<CaseRecord[]>('cases');}
 createCase(propertyId:string){return this.request<CaseRecord>('cases','POST',{propertyId});}
 submitCase(caseId:string){return this.request<CaseRecord>('cases/'+encodeURIComponent(caseId)+'/submit','POST',{});}
 getNotices(){return this.request<{evidence_processing:string}>('notices');}
 giveConsent(caseId:string,version:string){return this.request<{id:string}>('cases/'+encodeURIComponent(caseId)+'/consents','POST',{kind:'evidence_processing',version});}
 listEvidence(caseId:string){return this.request<EvidenceRecord[]>('cases/'+encodeURIComponent(caseId)+'/evidence');}
 /** Multipart upload. No Content-Type header: the runtime sets the multipart boundary. */
 async uploadEvidence(caseId:string,kind:EvidenceKind,file:PickedFile):Promise<EvidenceRecord>{
  const url=this.base()+'cases/'+encodeURIComponent(caseId)+'/evidence';
  const form=new FormData();
  form.append('kind',kind);
  // React Native FormData file part: {uri,name,type}; the file is streamed from local storage.
  form.append('file',{uri:file.uri,name:file.name,type:file.mimeType} as unknown as Blob);
  const res=await fetch(url,{method:'POST',headers:{'Authorization':'Bearer '+this.session.accessToken,'x-organization-id':this.session.organizationId},body:form});
  if(!res.ok) throw new ApiError(res.status, UPLOAD_ERRORS[res.status] ?? 'Errore API '+res.status);
  return res.json() as Promise<EvidenceRecord>;
 }
}

/** Identity endpoint: requires only the bearer token; the API derives memberships from its database. */
export async function fetchMe(apiBaseUrl: string, accessToken: string): Promise<MeResponse> {
 if (!/^https:\/\//.test(apiBaseUrl)) throw new Error('HTTPS API required');
 const res=await fetch(apiBaseUrl.replace(/\/$/,'')+'/v1/me',{method:'GET',headers:{'Authorization':'Bearer '+accessToken}});
 if(!res.ok) throw new ApiError(res.status, res.status===401?'Sessione non valida':'Errore API '+res.status);
 return res.json() as Promise<MeResponse>;
}
