import type { Core } from '@strapi/strapi';
/**
 * Browser-facing base path of the Strapi admin panel, e.g. `/admin`, or
 * `/strapi/admin` when a reverse proxy serves Strapi under a path prefix.
 *
 * Strapi resolves `admin.absoluteUrl` at boot from `server.url` (PUBLIC_URL)
 * combined with `admin.url`, so it already accounts for a proxy that exposes
 * Strapi under a prefix and strips that prefix before proxying — the prefix is
 * invisible to Strapi's own routing but must appear in anything we hand to the
 * browser (redirects, cookie paths).
 *
 * We keep only the pathname rather than using `absoluteUrl` wholesale: when
 * PUBLIC_URL is unset, Strapi falls back to the internal `http://host:port`,
 * and redirecting a browser there would send it to an address it may not be
 * able to reach. A path keeps the browser on the origin it already used.
 */
export declare const getAdminBasePath: (strapi: Core.Strapi) => string;
/** Admin login page, where sign-in failures are reported. */
export declare const getAdminLoginPath: (strapi: Core.Strapi) => string;
