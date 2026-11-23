export type UserRole = 'private_customer' | 'professional' | 'certifier' | 'admin';
export type CaseStatus = 'draft' | 'submitted' | 'awaiting_evidence' | 'assigned' | 'inspection_scheduled' | 'inspection_done' | 'under_review' | 'deposited' | 'delivered' | 'cancelled';
export type VerificationStatus = 'verified' | 'needs_review' | 'undetermined';
export interface Property { id: string; organizationId?: string; address: string; city: string; region: string; floorAreaM2?: number; }
export interface ApeCase { id: string; propertyId: string; requesterId: string; status: CaseStatus; createdAt: string; }
export interface Evidence { id: string; caseId: string; kind: 'boiler'|'heating'|'envelope'|'window'|'floorplan'|'document'; storageKey: string; }
export interface ExtractedField { id: string; evidenceId: string; name: string; value: string; confidence?: number; verification: VerificationStatus; }
