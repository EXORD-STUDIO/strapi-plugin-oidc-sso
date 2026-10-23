import type { Core } from '@strapi/strapi';
type OidcClientService = {
    init: () => Promise<void>;
    getAuthorizationUrl: () => Promise<{
        url: string;
        state: string;
        nonce: string;
        codeVerifier: string;
    }>;
    exchangeCode: (callbackParams: Record<string, string>, flowState: {
        state: string;
        nonce: string;
        codeVerifier: string;
    }) => Promise<{
        idToken: string;
        accessToken?: string;
        claims: Record<string, unknown>;
    }>;
    userinfo: (accessToken: string) => Promise<Record<string, unknown>>;
    getEndSessionUrl: (args: {
        idTokenHint?: string;
        postLogoutRedirectUri?: string;
    }) => string | undefined;
};
declare const _default: ({ strapi }: {
    strapi: Core.Strapi;
}) => OidcClientService;
export default _default;
