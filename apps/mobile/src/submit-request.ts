import { ApeApi, type ApiSession, type CaseRecord, type PropertyInput } from './api';
import { validateProperty } from './workflow';

export async function submitApeRequest(session: ApiSession | null, input: PropertyInput): Promise<CaseRecord> {
 const invalid=validateProperty(input);
 if(invalid.length) throw new Error('Campi non validi: '+invalid.join(', '));
 if(!session?.accessToken || !session.organizationId) throw new Error('Accedi per inviare una richiesta');
 const api=new ApeApi(session);
 const property=await api.createProperty(input);
 return api.createCase(property.id);
}
