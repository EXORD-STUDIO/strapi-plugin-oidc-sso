import type { Core } from '@strapi/strapi';
import type { Claims, ResolvedProfile } from '../types';
type MapInput = {
    claims: Claims;
    idToken: string;
    accessToken?: string;
};
type UserMapperService = {
    resolve: (input: MapInput) => Promise<ResolvedProfile>;
};
declare const _default: ({ strapi }: {
    strapi: Core.Strapi;
}) => UserMapperService;
export default _default;
