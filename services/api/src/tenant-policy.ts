/** Pure authorization predicates, reusable in API guards and unit tests. */
export type Membership = { organizationId: string; userSubject: string; active: boolean; role: string };
export function hasTenantAccess(membership: Membership | null, organizationId: string, subject: string): membership is Membership {
 return !!membership && membership.active === true && membership.organizationId === organizationId && membership.userSubject === subject;
}
export function canWrite(role: string): boolean {
 return ['owner','admin','member'].includes(role);
}

export const ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export type Role = (typeof ROLES)[number];
const RANK: Record<Role, number> = { owner: 3, admin: 2, member: 1, viewer: 0 };
export function isRole(value: unknown): value is Role {
 return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
/** Only owners and admins manage people. */
export function canManageMembers(role: string): boolean {
 return role === 'owner' || role === 'admin';
}
/** Owners may grant any role; admins only roles below admin. Nobody grants above their own rank. */
export function canGrantRole(actorRole: string, targetRole: string): boolean {
 if (!isRole(actorRole) || !isRole(targetRole) || !canManageMembers(actorRole)) return false;
 return actorRole === 'owner' || RANK[targetRole] < RANK.admin;
}
/** An admin may not modify an owner or another admin; owners may modify anyone. */
export function canModifyMember(actorRole: string, targetCurrentRole: string): boolean {
 if (!canManageMembers(actorRole) || !isRole(targetCurrentRole)) return false;
 return actorRole === 'owner' || RANK[targetCurrentRole] < RANK.admin;
}
