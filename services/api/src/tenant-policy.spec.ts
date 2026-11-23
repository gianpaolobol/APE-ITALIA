import { describe, expect, it } from 'vitest';
import { canWrite, hasTenantAccess } from './tenant-policy';
const membership={organizationId:'org-a',userSubject:'user-a',active:true,role:'member'};
describe('tenant policy',()=>{
 it('accepts a matching active membership',()=>expect(hasTenantAccess(membership,'org-a','user-a')).toBe(true));
 it('rejects a different tenant',()=>expect(hasTenantAccess(membership,'org-b','user-a')).toBe(false));
 it('rejects a different subject',()=>expect(hasTenantAccess(membership,'org-a','user-b')).toBe(false));
 it('rejects revoked memberships',()=>expect(hasTenantAccess({...membership,active:false},'org-a','user-a')).toBe(false));
 it('rejects absent membership',()=>expect(hasTenantAccess(null,'org-a','user-a')).toBe(false));
 it('restricts write access for viewers',()=>{expect(canWrite('viewer')).toBe(false);expect(canWrite('member')).toBe(true);});
});
