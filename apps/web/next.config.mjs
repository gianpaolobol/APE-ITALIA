/** @type {import('next').NextConfig} */
const securityHeaders = [
 { key: 'X-Frame-Options', value: 'DENY' },
 { key: 'X-Content-Type-Options', value: 'nosniff' },
 { key: 'Referrer-Policy', value: 'no-referrer' },
 { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
 { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];
export default {
 poweredByHeader: false,
 // Evidence is served through authorized, no-store routes; no on-demand image transformation.
 images: { unoptimized: true },
 // Self-contained server bundle for the container image (apps/web/Dockerfile).
 output: 'standalone',
 outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
 // Certificate PDFs (max 15 MB at the API) are forwarded through a Server Action.
 experimental: { serverActions: { bodySizeLimit: '16mb' } },
 async headers() { return [{ source: '/:path*', headers: securityHeaders }]; },
};
