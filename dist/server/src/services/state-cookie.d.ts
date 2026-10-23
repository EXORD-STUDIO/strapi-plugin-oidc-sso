import type { Context } from 'koa';
import type { Core } from '@strapi/strapi';
type StatePayload = {
    state: string;
    nonce: string;
    codeVerifier: string;
};
type StateCookieService = {
    set: (ctx: Context, payload: StatePayload) => Promise<void>;
    consume: (ctx: Context) => Promise<StatePayload | null>;
};
declare const _default: ({ strapi }: {
    strapi: Core.Strapi;
}) => StateCookieService;
export default _default;
