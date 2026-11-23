/**
 * Session orchestration: login via system browser, persistence in secure storage,
 * proactive refresh, expiry and logout. Never fabricates a session.
 */
import {
  AuthError, createAuthRequest, discover, exchangeCode, parseCallback, refreshTokens, revokeToken, validateIdToken,
  type CryptoPort, type FetchPort, type ProviderMetadata, type TokenSet,
} from './oidc';
import type { OidcPublicConfig } from '../auth-config';

export interface BrowserPort {
  /** Opens the system browser (ASWebAuthenticationSession / Custom Tabs) and resolves on redirect. */
  openAuthSession(url: string, redirectUri: string): Promise<{ type: 'success'; url: string } | { type: 'cancel' | 'dismiss' | 'locked' }>;
}
export interface SecureStoragePort {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}
export type AuthDeps = { crypto: CryptoPort; fetch: FetchPort; browser: BrowserPort; storage: SecureStoragePort; now?: () => number };

export type AuthSession = { accessToken: string; subject: string; expiresAt: number };

/** Only the refresh token and non-secret metadata are persisted; the access token lives in memory. */
type PersistedSession = { v: 1; issuer: string; clientId: string; subject: string; refreshToken: string };
export const STORAGE_KEY = 'apeitalia.auth.v1';
const REFRESH_MARGIN_SEC = 60;
const DEFAULT_SCOPE = 'openid profile offline_access';

export class OidcClient {
  private meta?: ProviderMetadata;
  private current?: TokenSet & { subject: string };
  private inflightRefresh?: Promise<AuthSession | null>;
  private loginInProgress = false;

  constructor(private readonly config: OidcPublicConfig, private readonly deps: AuthDeps) {}

  private nowSec(): number {
    return Math.floor((this.deps.now ? this.deps.now() : Date.now()) / 1000);
  }

  private async metadata(): Promise<ProviderMetadata> {
    if (!this.meta) this.meta = await discover(this.config.issuer, this.deps.fetch);
    return this.meta;
  }

  async login(): Promise<AuthSession> {
    if (this.loginInProgress) throw new AuthError('login_in_progress', 'Login already in progress');
    this.loginInProgress = true;
    try {
      const meta = await this.metadata();
      const req = await createAuthRequest(meta, { ...this.config, scope: DEFAULT_SCOPE }, this.deps.crypto);
      const result = await this.deps.browser.openAuthSession(req.url, this.config.redirectUri);
      if (result.type !== 'success') throw new AuthError('cancelled', 'Login cancelled');
      const { code } = parseCallback(result.url, { redirectUri: this.config.redirectUri, state: req.state, issuer: meta.issuer });
      const now = this.nowSec();
      const tokens = await exchangeCode(this.deps.fetch, meta, { code, verifier: req.verifier, clientId: this.config.clientId, redirectUri: this.config.redirectUri }, now);
      if (!tokens.idToken) throw new AuthError('id_token_invalid', 'ID token missing from token response');
      const claims = validateIdToken(tokens.idToken, { issuer: meta.issuer, clientId: this.config.clientId, nonce: req.nonce, nowSec: now });
      await this.adopt(tokens, claims.sub);
      return this.toSession();
    } finally {
      this.loginInProgress = false;
    }
  }

  private async adopt(tokens: TokenSet, subject: string): Promise<void> {
    this.current = { ...tokens, subject };
    if (tokens.refreshToken) {
      const persisted: PersistedSession = { v: 1, issuer: this.config.issuer, clientId: this.config.clientId, subject, refreshToken: tokens.refreshToken };
      await this.deps.storage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    } else {
      await this.deps.storage.deleteItem(STORAGE_KEY);
    }
  }

  private toSession(): AuthSession {
    const c = this.current!;
    return { accessToken: c.accessToken, subject: c.subject, expiresAt: c.expiresAt };
  }

  private async readPersisted(): Promise<PersistedSession | null> {
    const raw = await this.deps.storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const p = JSON.parse(raw) as PersistedSession;
      if (p.v === 1 && p.issuer === this.config.issuer && p.clientId === this.config.clientId && typeof p.refreshToken === 'string' && typeof p.subject === 'string') return p;
    } catch { /* fall through */ }
    await this.deps.storage.deleteItem(STORAGE_KEY);
    return null;
  }

  /** Returns a valid session, refreshing when close to expiry; null when the user must log in. */
  async getSession(): Promise<AuthSession | null> {
    if (this.current && this.current.expiresAt - REFRESH_MARGIN_SEC > this.nowSec()) return this.toSession();
    if (!this.inflightRefresh) this.inflightRefresh = this.refresh().finally(() => { this.inflightRefresh = undefined; });
    return this.inflightRefresh;
  }

  private async refresh(): Promise<AuthSession | null> {
    const persisted = this.current ? null : await this.readPersisted();
    const refreshToken = this.current?.refreshToken ?? persisted?.refreshToken;
    const subject = this.current?.subject ?? persisted?.subject;
    if (!refreshToken || !subject) {
      this.current = undefined;
      return null;
    }
    try {
      const meta = await this.metadata();
      const tokens = await refreshTokens(this.deps.fetch, meta, refreshToken, this.config.clientId, this.nowSec());
      await this.adopt(tokens, subject);
      return this.toSession();
    } catch (e) {
      if (e instanceof AuthError && e.code === 'invalid_grant') {
        // Revoked or expired refresh token: the session is over.
        await this.clearLocal();
        return null;
      }
      throw e;
    }
  }

  private async clearLocal(): Promise<void> {
    this.current = undefined;
    await this.deps.storage.deleteItem(STORAGE_KEY);
  }

  /** Local logout always succeeds; provider revocation is best effort. */
  async logout(): Promise<{ revoked: boolean }> {
    const refreshToken = this.current?.refreshToken ?? (await this.readPersisted())?.refreshToken;
    await this.clearLocal();
    if (!refreshToken) return { revoked: false };
    try {
      const meta = await this.metadata();
      return { revoked: await revokeToken(this.deps.fetch, meta, refreshToken, this.config.clientId, 'refresh_token') };
    } catch {
      return { revoked: false };
    }
  }
}
