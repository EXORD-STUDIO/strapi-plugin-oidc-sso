import type { Context } from 'koa';
import type { Core } from '@strapi/strapi';
import type { ResolvedProfile } from '../types';
type AdminUser = {
    id: number | string;
    email: string;
    isActive?: boolean;
    blocked?: boolean;
    registrationToken?: string | null;
};
type SessionService = {
    loginOrCreate: (profile: ResolvedProfile, ctx: Context) => Promise<{
        user: AdminUser;
        jwt: string;
    }>;
};
declare const _default: ({ strapi }: {
    strapi: Core.Strapi;
}) => SessionService;
export default _default;
