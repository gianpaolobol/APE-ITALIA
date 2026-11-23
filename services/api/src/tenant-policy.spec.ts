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

import { canGrantRole, canManageMembers, canModifyMember, isRole } from './tenant-policy';
describe('membership management policy', () => {
 it('only owners and admins manage members', () => {
  expect(canManageMembers('owner')).toBe(true);
  expect(canManageMembers('admin')).toBe(true);
  expect(canManageMembers('member')).toBe(false);
  expect(canManageMembers('viewer')).toBe(false);
 });
 it('owners can grant any role, admins only member/viewer', () => {
  expect(canGrantRole('owner', 'owner')).toBe(true);
  expect(canGrantRole('admin', 'admin')).toBe(false);
  expect(canGrantRole('admin', 'owner')).toBe(false);
  expect(canGrantRole('admin', 'member')).toBe(true);
  expect(canGrantRole('member', 'viewer')).toBe(false);
 });
 it('rejects unknown roles', () => {
  expect(isRole('superuser')).toBe(false);
  expect(canGrantRole('owner', 'superuser')).toBe(false);
 });
 it('admins cannot modify owners or other admins', () => {
  expect(canModifyMember('admin', 'owner')).toBe(false);
  expect(canModifyMember('admin', 'admin')).toBe(false);
  expect(canModifyMember('admin', 'viewer')).toBe(true);
  expect(canModifyMember('owner', 'owner')).toBe(true);
 });
});
