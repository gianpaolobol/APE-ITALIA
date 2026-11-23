import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { THROTTLER_LIMIT } from '@nestjs/throttler/dist/throttler.constants';

type Route = { method: string; path: string; access: string; status: number; limit: number | null; handler: string };

const join = (...parts: string[]) => '/' + parts.flatMap(p => p.split('/')).filter(Boolean).join('/');

/** Lists every HTTP route from controller metadata (no server boot, no database). */
export function collectRoutes(module: object): Route[] {
 const controllers: (new (...a: never[]) => object)[] = Reflect.getMetadata('controllers', module) ?? [];
 const out: Route[] = [];
 for (const ctrl of controllers) {
  const base = String(Reflect.getMetadata(PATH_METADATA, ctrl) ?? '');
  for (const name of Object.getOwnPropertyNames(ctrl.prototype)) {
   const fn = (ctrl.prototype as Record<string, unknown>)[name];
   if (typeof fn !== 'function' || name === 'constructor') continue;
   const sub = Reflect.getMetadata(PATH_METADATA, fn);
   if (sub === undefined) continue;
   const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, fn) as number];
   const args: Record<string, { data?: unknown }> = Reflect.getMetadata(ROUTE_ARGS_METADATA, ctrl, name) ?? {};
   const headers = Object.entries(args).filter(([k]) => Number(k.split(':')[0]) === RouteParamtypes.HEADERS).map(([, v]) => String(v.data).toLowerCase());
   const path = join(base, String(sub));
   const access = headers.includes('x-organization-id') ? 'membro dell\'organizzazione'
    : path.startsWith('/v1/certifier/') ? 'certificatore verificato'
    : headers.includes('authorization') ? 'utente autenticato' : 'pubblico';
   const status = Reflect.getMetadata(HTTP_CODE_METADATA, fn) ?? (method === 'POST' ? 201 : 200);
   const limit = Reflect.getMetadata(THROTTLER_LIMIT + 'default', fn) ?? null;
   out.push({ method, path, access, status, limit, handler: `${ctrl.name}.${name}` });
  }
 }
 return out.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

export function renderApiIndex(routes: Route[]): string {
 const rows = routes.map(r => `| ${r.method} | \`${r.path}\` | ${r.access} | ${r.status} | ${r.limit ? `${r.limit}/min` : 'predefinito'} | \`${r.handler}\` |`);
 return [
  '# Indice dell\'API',
  '',
  '<!-- Generato da services/api/src/tools/api-index.ts: non modificare a mano. Aggiornare con `npm run docs:api -w @ape/api`. -->',
  '',
  `${routes.length} rotte. Autenticazione: \`Authorization: Bearer <access token OIDC>\`; le rotte "membro dell'organizzazione" richiedono anche \`x-organization-id\` e una membership attiva verificata a ogni richiesta. Limite predefinito: 120 richieste/minuto per rotta e IP. Dettagli funzionali nei documenti di area in \`docs/\`.`,
  '',
  '| Metodo | Percorso | Accesso | Esito | Limite | Handler |',
  '|---|---|---|---|---|---|',
  ...rows,
  '',
 ].join('\n');
}
