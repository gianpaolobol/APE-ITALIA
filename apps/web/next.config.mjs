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
 // Certificate PDFs (max 15 MB at the API) are forwarded through a Server Action.
 experimental: { serverActions: { bodySizeLimit: '16mb' } },
 async headers() { return [{ source: '/:path*', headers: securityHeaders }]; },
};
