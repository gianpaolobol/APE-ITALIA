/**
 * Certifier matching (MASTER_PLAN §6). Mandatory filters first, ranking second.
 * Distance, cost and quality signals are not yet available: ranking uses load and seniority only.
 */
export type Candidate = {
 id: string;
 userSubject: string;
 regions: string[];
 active: boolean;
 verifiedAt: Date | null;
 maxActiveAssignments: number;
 activeAssignments: number;
};
export type CaseContext = { region: string; requesterSubjects: Set<string>; previouslyOffered: Set<string> };
export type Exclusion = 'inactive' | 'unverified' | 'region' | 'conflict_of_interest' | 'already_offered' | 'capacity';

const norm = (r: string) => r.trim().toLocaleLowerCase('it-IT');

export function exclusionReason(c: Candidate, ctx: CaseContext): Exclusion | null {
 if (!c.active) return 'inactive';
 if (!c.verifiedAt) return 'unverified';
 if (!c.regions.some(r => norm(r) === norm(ctx.region))) return 'region';
 // Independence: a certifier who belongs to the requesting organization must not certify its cases.
 if (ctx.requesterSubjects.has(c.userSubject)) return 'conflict_of_interest';
 if (ctx.previouslyOffered.has(c.id)) return 'already_offered';
 if (c.activeAssignments >= c.maxActiveAssignments) return 'capacity';
 return null;
}

export function rankCandidates(candidates: Candidate[], ctx: CaseContext): Candidate[] {
 return candidates
  .filter(c => exclusionReason(c, ctx) === null)
  .sort((a, b) =>
   a.activeAssignments / a.maxActiveAssignments - b.activeAssignments / b.maxActiveAssignments ||
   a.activeAssignments - b.activeAssignments ||
   a.verifiedAt!.getTime() - b.verifiedAt!.getTime() ||
   a.id.localeCompare(b.id));
}

export const OFFER_TTL_HOURS = 48;
