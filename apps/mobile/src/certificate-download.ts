import type { ApiSession } from './api';

/** Ports so the download flow is testable without native modules. */
export type DownloadPort = (url: string, fileName: string, headers: Record<string, string>) => Promise<{ uri: string }>;
export type SharePort = { available(): Promise<boolean>; share(uri: string): Promise<void> };

/**
 * Downloads the delivered APE to the app's private cache (not the shared gallery) and opens the system
 * share/preview sheet. The first download marks the case as delivered on the server.
 */
export async function downloadCertificate(session: ApiSession, caseId: string, deps: { download: DownloadPort; share: SharePort }): Promise<string> {
 if (!/^https:\/\//.test(session.apiBaseUrl)) throw new Error('HTTPS API required');
 if (!/^[0-9a-f-]{36}$/i.test(caseId)) throw new Error('Invalid case');
 const url = session.apiBaseUrl.replace(/\/$/, '') + `/v1/cases/${caseId}/certificate/content`;
 const file = await deps.download(url, `APE-${caseId}.pdf`, { Authorization: 'Bearer ' + session.accessToken, 'x-organization-id': session.organizationId });
 if (await deps.share.available()) await deps.share.share(file.uri);
 return file.uri;
}
