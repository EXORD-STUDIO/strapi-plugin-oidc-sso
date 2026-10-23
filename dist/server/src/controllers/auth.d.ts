import type { Context } from 'koa';
import type { Core } from '@strapi/strapi';
declare const _default: ({ strapi }: {
    strapi: Core.Strapi;
}) => {
    uiConfig(ctx: Context): void;
    login(ctx: Context): Promise<void>;
    callback(ctx: Context): Promise<void>;
};
export default _default;
