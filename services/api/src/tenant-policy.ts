/** Pure authorization predicates, reusable in API guards and unit tests. */
export type Membership = { organizationId: string; userSubject: string; active: boolean; role: string };
export function hasTenantAccess(membership: Membership | null, organizationId: string, subject: string): membership is Membership {
 return !!membership && membership.active === true && membership.organizationId === organizationId && membership.userSubject === subject;
}
export function canWrite(role: string): boolean {
 return ['owner','admin','member'].includes(role);
}
