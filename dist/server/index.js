"use strict";
const zod = require("zod");
const node_crypto = require("node:crypto");
const openidClient = require("openid-client");
const jose = require("jose");
const generator = require("generate-password");
const _interopDefault = (e) => e && e.__esModule ? e : { default: e };
const generator__default = /* @__PURE__ */ _interopDefault(generator);
const register = (_args) => {
};
const TENANT_PLACEHOLDER$1 = "{tenantid}";
let tenantWarningLogged = false;
const bootstrap = async ({ strapi }) => {
  const cfg = strapi.config.get("plugin::oidc-sso");
  if (!tenantWarningLogged && cfg.issuer?.includes(TENANT_PLACEHOLDER$1) && !(cfg.allowedTenantIds && cfg.allowedTenantIds.length > 0)) {
    tenantWarningLogged = true;
    strapi.log.warn(
      "[oidc-sso] multi-tenant issuer configured without `allowedTenantIds` — every tenant of the IdP is accepted. Set `allowedTenantIds` to restrict sign-in to known tenants."
    );
  }
  const oidcClient2 = strapi.plugin("oidc-sso").service("oidc-client");
  try {
    await oidcClient2.init();
    strapi.log.info("[oidc-sso] OIDC client initialised.");
  } catch (err) {
    strapi.log.error(
      `[oidc-sso] failed to initialise OIDC client: ${err.message}`
    );
  }
};
const destroy = (_args) => {
};
const endpointsSchema = zod.z.object({
  authorization: zod.z.string().url().optional(),
  token: zod.z.string().url().optional(),
  userinfo: zod.z.string().url().optional(),
  jwks: zod.z.string().url().optional(),
  endSession: zod.z.string().url().optional()
}).partial().optional();
const configSchema = zod.z.object({
  issuer: zod.z.string().url().optional(),
  endpoints: endpointsSchema,
  clientId: zod.z.string().min(1),
  clientSecret: zod.z.string().min(1),
  redirectUri: zod.z.string().url(),
  scopes: zod.z.array(zod.z.string()).min(1),
  userMapping: zod.z.any().refine((v) => typeof v === "function", {
    message: "userMapping must be a function (claims, ctx) => ({ email, firstName?, lastName? })"
  }),
  autoCreateUsers: zod.z.boolean(),
  defaultRoles: zod.z.array(zod.z.string()),
  allowedDomains: zod.z.array(zod.z.string()),
  useUserinfo: zod.z.boolean(),
  requireEmailVerified: zod.z.boolean().optional(),
  allowedTenantIds: zod.z.array(zod.z.string()).optional(),
  secureCookies: zod.z.boolean().optional(),
  buttonLabel: zod.z.string().min(1),
  buttonIcon: zod.z.string().optional(),
  buttonStyle: zod.z.object({
    background: zod.z.string().optional(),
    color: zod.z.string().optional(),
    borderColor: zod.z.string().optional(),
    hoverBackground: zod.z.string().optional(),
    hoverColor: zod.z.string().optional()
  }).partial().optional()
}).refine(
  (cfg) => {
    const e = cfg.endpoints ?? {};
    const haveCoreEndpoints = !!(e.authorization && e.token && e.jwks);
    return !!cfg.issuer || haveCoreEndpoints;
  },
  {
    message: "Provide either `issuer` (for OIDC discovery) or all of endpoints.{authorization, token, jwks}."
  }
).refine((cfg) => cfg.scopes.includes("openid"), {
  message: '`scopes` must include "openid" — without it the IdP returns no id_token and sign-in cannot be verified.'
});
const defaults = {
  scopes: ["openid", "profile", "email"],
  autoCreateUsers: false,
  defaultRoles: [],
  allowedDomains: [],
  useUserinfo: false,
  buttonLabel: "Login with SSO"
};
const config = {
  default: defaults,
  validator(config2) {
    const parsed = configSchema.safeParse(config2);
    if (!parsed.success) {
      const messages = parsed.error.errors.map((e) => `  - ${e.path.join(".") || "<root>"}: ${e.message}`).join("\n");
      throw new Error(
        `[strapi-plugin-oidc-sso] invalid plugin config:
${messages}`
      );
    }
  }
};
const contentTypes = {};
const DEFAULT_ADMIN_PATH = "/admin";
const getAdminBasePath = (strapi) => {
  const absoluteUrl = strapi.config.get("admin.absoluteUrl");
  if (typeof absoluteUrl === "string" && absoluteUrl) {
    try {
      const { pathname } = new URL(absoluteUrl);
      const trimmed = pathname.replace(/\/+$/, "");
      if (trimmed) return trimmed;
    } catch {
    }
  }
  return DEFAULT_ADMIN_PATH;
};
const getAdminLoginPath = (strapi) => `${getAdminBasePath(strapi)}/auth/login`;
const renderHandoffHtml = (jwt, nonce, adminBasePath) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Signing you in…</title>
  <meta name="robots" content="noindex" />
</head>
<body>
  <p>Signing you in…</p>
  <script nonce="${nonce}">
    (function () {
      try {
        var jwt = ${JSON.stringify(jwt)};
        try { window.localStorage.setItem('jwtToken', JSON.stringify(jwt)); } catch (_) {}
        try { window.localStorage.setItem('isLoggedIn', 'true'); } catch (_) {}
        try { window.sessionStorage.setItem('jwtToken', JSON.stringify(jwt)); } catch (_) {}
        document.cookie = 'jwtToken=' + encodeURIComponent(jwt) + '; path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
        window.location.replace(${JSON.stringify(adminBasePath)});
      } catch (e) {
        window.location.replace(${JSON.stringify(`${adminBasePath}/auth/login?error=oidc`)});
      }
    })();
  <\/script>
</body>
</html>`;
const sendError = (strapi, ctx, code) => {
  ctx.redirect(
    `${getAdminLoginPath(strapi)}?oidc_error=${encodeURIComponent(code)}`
  );
};
const sendHandoff = (strapi, ctx, jwt) => {
  const nonce = node_crypto.randomBytes(16).toString("base64");
  ctx.status = 200;
  ctx.type = "text/html; charset=utf-8";
  ctx.set("Cache-Control", "no-store");
  ctx.set(
    "Content-Security-Policy",
    `default-src 'self'; script-src 'self' 'nonce-${nonce}'; base-uri 'self'; frame-ancestors 'none'`
  );
  ctx.body = renderHandoffHtml(jwt, nonce, getAdminBasePath(strapi));
};
const getCode = (err) => err.code ?? "INVALID_OIDC_FLOW";
const isObject = (value) => typeof value === "object" && value !== null;
const mergeClaims = (idTokenClaims, userinfoClaims) => userinfoClaims ? { ...idTokenClaims, ...userinfoClaims } : idTokenClaims;
const auth = ({ strapi }) => ({
  uiConfig(ctx) {
    const cfg = strapi.config.get("plugin::oidc-sso");
    ctx.set("Cache-Control", "no-store");
    ctx.body = {
      label: cfg.buttonLabel,
      icon: cfg.buttonIcon ?? null,
      style: cfg.buttonStyle ?? null
    };
  },
  async login(ctx) {
    try {
      const oidc = strapi.plugin("oidc-sso").service("oidc-client");
      const stateCookie2 = strapi.plugin("oidc-sso").service("state-cookie");
      const { url, state, nonce, codeVerifier } = await oidc.getAuthorizationUrl();
      await stateCookie2.set(ctx, { state, nonce, codeVerifier });
      ctx.redirect(url);
    } catch (err) {
      strapi.log.error(`[oidc-sso] /login failed: ${err.message}`);
      sendError(strapi, ctx, "IDP_UNREACHABLE");
    }
  },
  async callback(ctx) {
    const cfg = strapi.config.get("plugin::oidc-sso");
    const oidc = strapi.plugin("oidc-sso").service("oidc-client");
    const stateCookie2 = strapi.plugin("oidc-sso").service("state-cookie");
    const userMapper2 = strapi.plugin("oidc-sso").service("user-mapper");
    const session2 = strapi.plugin("oidc-sso").service("session");
    const flow = await stateCookie2.consume(ctx);
    if (!flow) {
      sendError(strapi, ctx, "INVALID_OIDC_FLOW");
      return;
    }
    let idToken;
    let accessToken;
    let claims;
    try {
      const params = {};
      if (isObject(ctx.query)) {
        for (const [k, v] of Object.entries(ctx.query)) {
          if (typeof v === "string") params[k] = v;
        }
      }
      const result = await oidc.exchangeCode(params, flow);
      idToken = result.idToken;
      accessToken = result.accessToken;
      claims = result.claims;
      if (cfg.useUserinfo && accessToken) {
        const ui = await oidc.userinfo(accessToken);
        if (typeof ui.sub !== "string" || typeof claims.sub !== "string" || ui.sub !== claims.sub) {
          throw new Error("[oidc-sso] userinfo sub does not match id_token sub");
        }
        claims = mergeClaims(claims, ui);
      }
    } catch (err) {
      strapi.log.warn(
        `[oidc-sso] token exchange failed: ${err.message}`
      );
      sendError(strapi, ctx, "INVALID_OIDC_FLOW");
      return;
    }
    let profile;
    try {
      profile = await userMapper2.resolve({ claims, idToken, accessToken });
    } catch (err) {
      const code = getCode(err) === "DOMAIN_NOT_ALLOWED" ? "DOMAIN_NOT_ALLOWED" : "MAPPING_REJECTED";
      strapi.log.warn(`[oidc-sso] user-mapping rejected: ${err.message}`);
      sendError(strapi, ctx, code);
      return;
    }
    let jwt;
    try {
      ({ jwt } = await session2.loginOrCreate(profile, ctx));
    } catch (err) {
      const code = getCode(err);
      strapi.log.warn(`[oidc-sso] session refused: ${err.message}`);
      sendError(
        strapi,
        ctx,
        [
          "USER_NOT_PROVISIONED",
          "USER_DISABLED",
          "ROLES_NOT_FOUND",
          "SESSION_MANAGER_UNAVAILABLE",
          "ACCESS_TOKEN_FAILED",
          "EMAIL_NOT_VERIFIED"
        ].includes(code) ? code : "INVALID_OIDC_FLOW"
      );
      return;
    }
    sendHandoff(strapi, ctx, jwt);
  }
});
const controllers = {
  auth
};
const routes = [
  {
    method: "GET",
    path: "/ui-config",
    handler: "auth.uiConfig",
    config: {
      auth: false,
      policies: []
    }
  },
  {
    method: "GET",
    path: "/login",
    handler: "auth.login",
    config: {
      auth: false,
      policies: []
    }
  },
  {
    method: "GET",
    path: "/callback",
    handler: "auth.callback",
    config: {
      auth: false,
      policies: []
    }
  }
];
const TENANT_PLACEHOLDER = "{tenantid}";
const STATIC_ISSUER = "oidc-sso-static";
let cachedClient = null;
let initPromise = null;
const getConfig = (strapi) => strapi.config.get("plugin::oidc-sso");
const buildIssuerMetadata = async (cfg) => {
  const overrides = cfg.endpoints ?? {};
  let base = { issuer: cfg.issuer ?? STATIC_ISSUER };
  if (cfg.issuer) {
    const discovered = await openidClient.Issuer.discover(cfg.issuer);
    base = { ...discovered.metadata };
  }
  return {
    ...base,
    ...overrides.authorization && { authorization_endpoint: overrides.authorization },
    ...overrides.token && { token_endpoint: overrides.token },
    ...overrides.userinfo && { userinfo_endpoint: overrides.userinfo },
    ...overrides.jwks && { jwks_uri: overrides.jwks },
    ...overrides.endSession && { end_session_endpoint: overrides.endSession },
    issuer: base.issuer || cfg.issuer || STATIC_ISSUER
  };
};
const oidcClient = ({ strapi }) => {
  const initClient = async () => {
    const cfg = getConfig(strapi);
    const metadata = await buildIssuerMetadata(cfg);
    const issuer = new openidClient.Issuer(metadata);
    const client = new issuer.Client({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uris: [cfg.redirectUri],
      response_types: ["code"]
    });
    cachedClient = client;
    return client;
  };
  const ensureClient = async () => {
    if (cachedClient) return cachedClient;
    if (!initPromise) {
      initPromise = initClient().finally(() => {
        initPromise = null;
      });
    }
    return initPromise;
  };
  return {
    async init() {
      await ensureClient();
    },
    async getAuthorizationUrl() {
      const client = await ensureClient();
      const cfg = getConfig(strapi);
      const state = openidClient.generators.state();
      const nonce = openidClient.generators.nonce();
      const codeVerifier = openidClient.generators.codeVerifier();
      const codeChallenge = openidClient.generators.codeChallenge(codeVerifier);
      const url = client.authorizationUrl({
        scope: cfg.scopes.join(" "),
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: "S256"
      });
      return { url, state, nonce, codeVerifier };
    },
    async exchangeCode(callbackParams, flowState) {
      const client = await ensureClient();
      const cfg = getConfig(strapi);
      const issuerTemplate = client.issuer.metadata.issuer;
      const isTemplated = issuerTemplate?.includes(TENANT_PLACEHOLDER) ?? false;
      const isEndpointsOnly = cfg.issuer === void 0 && issuerTemplate === STATIC_ISSUER;
      const returnedState = typeof callbackParams.state === "string" ? callbackParams.state : void 0;
      if (returnedState !== flowState.state) {
        throw new Error("[oidc-sso] state mismatch");
      }
      const code = typeof callbackParams.code === "string" ? callbackParams.code : void 0;
      if (!code) {
        throw new Error("[oidc-sso] no authorization code in callback");
      }
      if (!isTemplated && !isEndpointsOnly) {
        const tokenSet2 = await client.callback(cfg.redirectUri, callbackParams, {
          state: flowState.state,
          nonce: flowState.nonce,
          code_verifier: flowState.codeVerifier
        });
        if (!tokenSet2.id_token) {
          throw new Error("[oidc-sso] provider did not return an id_token");
        }
        return {
          idToken: tokenSet2.id_token,
          accessToken: tokenSet2.access_token,
          claims: tokenSet2.claims()
        };
      }
      const tokenSet = await client.grant({
        grant_type: "authorization_code",
        code,
        redirect_uri: cfg.redirectUri,
        code_verifier: flowState.codeVerifier
      });
      if (!tokenSet.id_token) {
        throw new Error("[oidc-sso] provider did not return an id_token");
      }
      const unverified = jose.decodeJwt(tokenSet.id_token);
      let expectedIssuer;
      if (isTemplated) {
        if (!unverified.tid) {
          throw new Error("[oidc-sso] id_token missing tid claim (multi-tenant)");
        }
        const allowedTenants = cfg.allowedTenantIds ?? [];
        if (allowedTenants.length > 0 && !allowedTenants.includes(unverified.tid)) {
          throw new Error(
            `[oidc-sso] tenant "${unverified.tid}" is not in the allowedTenantIds allow-list`
          );
        }
        expectedIssuer = issuerTemplate.replace(
          TENANT_PLACEHOLDER,
          unverified.tid
        );
      }
      const jwksUri = client.issuer.metadata.jwks_uri;
      if (!jwksUri) {
        throw new Error("[oidc-sso] issuer metadata missing jwks_uri");
      }
      const jwks = jose.createRemoteJWKSet(new URL(jwksUri));
      const { payload } = await jose.jwtVerify(tokenSet.id_token, jwks, {
        audience: cfg.clientId,
        ...expectedIssuer ? { issuer: expectedIssuer } : {}
      });
      if (payload.nonce !== flowState.nonce) {
        throw new Error("[oidc-sso] id_token nonce mismatch");
      }
      return {
        idToken: tokenSet.id_token,
        accessToken: tokenSet.access_token,
        claims: payload
      };
    },
    async userinfo(accessToken) {
      if (!cachedClient) {
        throw new Error("[oidc-sso] OIDC client is not initialised");
      }
      return await cachedClient.userinfo(accessToken);
    },
    getEndSessionUrl({ idTokenHint, postLogoutRedirectUri }) {
      if (!cachedClient) return void 0;
      try {
        return cachedClient.endSessionUrl({
          id_token_hint: idTokenHint,
          post_logout_redirect_uri: postLogoutRedirectUri
        });
      } catch {
        return void 0;
      }
    }
  };
};
const COOKIE_NAME = "oidc_sso_state";
const TTL_SECONDS = 600;
const STATE_AUDIENCE = "oidc-sso-state";
const STATE_ISSUER = "oidc-sso";
const getKey = (strapi) => {
  const secret = strapi.config.get("admin.auth.secret") ?? strapi.config.get("admin.auth.options.secret") ?? process.env.ADMIN_JWT_SECRET ?? process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "[oidc-sso] cannot sign state cookie: admin JWT secret not configured"
    );
  }
  return new TextEncoder().encode(secret);
};
const stateCookie = ({ strapi }) => ({
  async set(ctx, payload) {
    const cfg = strapi.config.get("plugin::oidc-sso");
    const token = await new jose.SignJWT({ ...payload }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setAudience(STATE_AUDIENCE).setIssuer(STATE_ISSUER).setIssuedAt().setExpirationTime(`${TTL_SECONDS}s`).sign(getKey(strapi));
    ctx.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: cfg.secureCookies ?? ctx.secure,
      maxAge: TTL_SECONDS * 1e3,
      overwrite: true,
      path: "/"
    });
  },
  async consume(ctx) {
    const raw = ctx.cookies.get(COOKIE_NAME);
    ctx.cookies.set(COOKIE_NAME, null, { path: "/" });
    if (!raw) return null;
    try {
      const { payload } = await jose.jwtVerify(raw, getKey(strapi), {
        algorithms: ["HS256"],
        audience: STATE_AUDIENCE,
        issuer: STATE_ISSUER
      });
      const { state, nonce, codeVerifier } = payload;
      if (typeof state !== "string" || typeof nonce !== "string" || typeof codeVerifier !== "string") {
        return null;
      }
      return { state, nonce, codeVerifier };
    } catch {
      return null;
    }
  }
});
const mappedUserSchema = zod.z.object({
  email: zod.z.string().email(),
  firstName: zod.z.string().optional(),
  lastName: zod.z.string().optional(),
  username: zod.z.string().optional(),
  groups: zod.z.array(zod.z.string()).optional()
});
const userMapper = ({ strapi }) => ({
  async resolve({ claims, idToken, accessToken }) {
    const cfg = strapi.config.get("plugin::oidc-sso");
    const fn = cfg.userMapping;
    const raw = await fn(claims, { idToken, accessToken, strapi });
    const parsed = mappedUserSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `[oidc-sso] userMapping returned invalid shape: ${parsed.error.message}`
      );
    }
    const email = parsed.data.email.toLowerCase();
    const allowed = cfg.allowedDomains.map((d) => d.trim().toLowerCase()).filter(Boolean);
    if (allowed.length > 0) {
      const domain = email.split("@")[1] ?? "";
      if (!allowed.includes(domain)) {
        const err = new Error(`domain "${domain}" is not allowed`);
        err.code = "DOMAIN_NOT_ALLOWED";
        throw err;
      }
    }
    return { ...parsed.data, email, rawClaims: claims };
  }
});
const REFRESH_COOKIE_NAME = "strapi_admin_refresh";
const codedError = (code, message) => {
  const err = new Error(message ?? code);
  err.code = code;
  return err;
};
const lookupRole = async (strapi, code) => await strapi.db.query("admin::role").findOne({ where: { code } });
const resolveRoleIds = async (strapi, codes) => {
  if (codes.length === 0) {
    const fallback = await lookupRole(strapi, "strapi-author");
    return fallback ? [fallback.id] : [];
  }
  const roles = (await Promise.all(codes.map((c) => lookupRole(strapi, c)))).filter(
    (r) => r !== null
  );
  if (roles.length === 0) {
    throw codedError(
      "ROLES_NOT_FOUND",
      `none of the configured defaultRoles exist: ${codes.join(", ")}`
    );
  }
  return roles.map((r) => r.id);
};
const generateAccessToken = async (strapi, ctx, user) => {
  const sessionManager = strapi.sessionManager;
  if (!sessionManager) {
    throw codedError(
      "SESSION_MANAGER_UNAVAILABLE",
      "strapi.sessionManager is not available; upgrade Strapi to v5.24.1 or later"
    );
  }
  const userId = String(user.id);
  const deviceId = node_crypto.randomUUID();
  const cfg = strapi.config.get("plugin::oidc-sso");
  const { token: refreshToken } = await sessionManager("admin").generateRefreshToken(
    userId,
    deviceId,
    { type: "session" }
  );
  ctx.cookies.set(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: cfg.secureCookies ?? ctx.secure,
    // Cookie paths are matched by the browser against the URL it requested, so
    // this has to carry the reverse-proxy prefix; scoping it to a bare /admin
    // behind a proxy means the cookie is never sent back and the session
    // cannot be refreshed.
    path: getAdminBasePath(strapi),
    overwrite: true
  });
  const accessResult = await sessionManager("admin").generateAccessToken(refreshToken);
  if ("error" in accessResult) {
    throw codedError("ACCESS_TOKEN_FAILED", accessResult.error);
  }
  return accessResult.token;
};
const session = ({ strapi }) => ({
  async loginOrCreate(profile, ctx) {
    const cfg = strapi.config.get("plugin::oidc-sso");
    const userService = strapi.service("admin::user");
    const emailVerified = profile.rawClaims?.email_verified;
    if (emailVerified === false) {
      throw codedError(
        "EMAIL_NOT_VERIFIED",
        "the identity provider reports email_verified=false for this account"
      );
    }
    if (cfg.requireEmailVerified && emailVerified !== true) {
      throw codedError(
        "EMAIL_NOT_VERIFIED",
        "requireEmailVerified is enabled but the identity provider did not confirm email_verified=true"
      );
    }
    let user = await userService.findOneByEmail(profile.email);
    if (!user) {
      if (!cfg.autoCreateUsers) {
        throw codedError("USER_NOT_PROVISIONED");
      }
      const roleIds = await resolveRoleIds(strapi, cfg.defaultRoles);
      const created = await userService.create({
        firstname: profile.firstName ?? profile.email.split("@")[0],
        lastname: profile.lastName ?? "",
        email: profile.email,
        roles: roleIds
      });
      const password = generator__default.default.generate({
        length: 43,
        numbers: true,
        lowercase: true,
        uppercase: true,
        exclude: '()+_-=}{[]|:;"/?.><,`~',
        strict: true
      });
      user = await userService.register({
        registrationToken: created.registrationToken,
        userInfo: {
          firstname: profile.firstName ?? profile.email.split("@")[0],
          lastname: profile.lastName ?? "",
          password
        }
      });
      strapi.log.info(
        `[oidc-sso] auto-provisioned admin user ${profile.email} with roles ${cfg.defaultRoles.join(", ") || "(default)"}`
      );
    }
    if (user.isActive === false || user.blocked === true) {
      throw codedError("USER_DISABLED");
    }
    const jwt = await generateAccessToken(strapi, ctx, user);
    return { user, jwt };
  }
});
const services = {
  "oidc-client": oidcClient,
  "state-cookie": stateCookie,
  "user-mapper": userMapper,
  session
};
const policies = {};
const middlewares = {};
const plugin = {
  register,
  bootstrap,
  destroy,
  config,
  controllers,
  routes,
  services,
  contentTypes,
  policies,
  middlewares
};
module.exports = plugin;
