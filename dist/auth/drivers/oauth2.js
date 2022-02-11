"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOAuth2AuthRouter = exports.OAuth2AuthDriver = void 0;
const express_1 = require("express");
const openid_client_1 = require("openid-client");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const ms_1 = __importDefault(require("ms"));
const local_1 = require("./local");
const auth_1 = require("../../auth");
const env_1 = __importDefault(require("../../env"));
const services_1 = require("../../services");
const exceptions_1 = require("../../exceptions");
const respond_1 = require("../../middleware/respond");
const async_handler_1 = __importDefault(require("../../utils/async-handler"));
const url_1 = require("../../utils/url");
const logger_1 = __importDefault(require("../../logger"));
const get_ip_from_req_1 = require("../../utils/get-ip-from-req");
class OAuth2AuthDriver extends local_1.LocalAuthDriver {
    constructor(options, config) {
        super(options, config);
        const { authorizeUrl, accessUrl, profileUrl, clientId, clientSecret, ...additionalConfig } = config;
        if (!authorizeUrl || !accessUrl || !profileUrl || !clientId || !clientSecret || !additionalConfig.provider) {
            throw new exceptions_1.InvalidConfigException('Invalid provider config', { provider: additionalConfig.provider });
        }
        const redirectUrl = new url_1.Url(env_1.default.PUBLIC_URL).addPath('auth', 'login', additionalConfig.provider, 'callback');
        this.redirectUrl = redirectUrl.toString();
        this.usersService = new services_1.UsersService({ knex: this.knex, schema: this.schema });
        this.config = additionalConfig;
        const issuer = new openid_client_1.Issuer({
            authorization_endpoint: authorizeUrl,
            token_endpoint: accessUrl,
            userinfo_endpoint: profileUrl,
            issuer: additionalConfig.provider,
        });
        this.client = new issuer.Client({
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uris: [this.redirectUrl],
            response_types: ['code'],
        });
    }
    generateCodeVerifier() {
        return openid_client_1.generators.codeVerifier();
    }
    generateAuthUrl(codeVerifier, prompt = false) {
        var _a;
        try {
            const codeChallenge = openid_client_1.generators.codeChallenge(codeVerifier);
            const paramsConfig = typeof this.config.params === 'object' ? this.config.params : {};
            return this.client.authorizationUrl({
                scope: (_a = this.config.scope) !== null && _a !== void 0 ? _a : 'email',
                access_type: 'offline',
                prompt: prompt ? 'consent' : undefined,
                ...paramsConfig,
                code_challenge: codeChallenge,
                code_challenge_method: 'S256',
                // Some providers require state even with PKCE
                state: codeChallenge,
            });
        }
        catch (e) {
            throw handleError(e);
        }
    }
    async fetchUserId(identifier) {
        const user = await this.knex
            .select('id')
            .from('directus_users')
            .whereRaw('LOWER(??) = ?', ['external_identifier', identifier.toLowerCase()])
            .first();
        return user === null || user === void 0 ? void 0 : user.id;
    }
    async getUserID(payload) {
        var _a;
        if (!payload.code || !payload.codeVerifier) {
            logger_1.default.trace('[OAuth2] No code or codeVerifier in payload');
            throw new exceptions_1.InvalidCredentialsException();
        }
        let tokenSet;
        let userInfo;
        try {
            tokenSet = await this.client.oauthCallback(this.redirectUrl, { code: payload.code, state: payload.state }, { code_verifier: payload.codeVerifier, state: openid_client_1.generators.codeChallenge(payload.codeVerifier) });
            userInfo = await this.client.userinfo(tokenSet.access_token);
        }
        catch (e) {
            throw handleError(e);
        }
        const { emailKey, identifierKey, allowPublicRegistration } = this.config;
        const email = userInfo[emailKey !== null && emailKey !== void 0 ? emailKey : 'email'];
        // Fallback to email if explicit identifier not found
        const identifier = (_a = userInfo[identifierKey]) !== null && _a !== void 0 ? _a : email;
        if (!identifier) {
            logger_1.default.warn(`[OAuth2] Failed to find user identifier for provider "${this.config.provider}"`);
            throw new exceptions_1.InvalidCredentialsException();
        }
        const userId = await this.fetchUserId(identifier);
        if (userId) {
            // Update user refreshToken if provided
            if (tokenSet.refresh_token) {
                await this.usersService.updateOne(userId, {
                    auth_data: JSON.stringify({ refreshToken: tokenSet.refresh_token }),
                });
            }
            return userId;
        }
        // Is public registration allowed?
        if (!allowPublicRegistration) {
            logger_1.default.trace(`[OAuth2] User doesn't exist, and public registration not allowed for provider "${this.config.provider}"`);
            throw new exceptions_1.InvalidCredentialsException();
        }
        await this.usersService.createOne({
            provider: this.config.provider,
            email: email,
            external_identifier: identifier,
            role: this.config.defaultRoleId,
            auth_data: tokenSet.refresh_token && JSON.stringify({ refreshToken: tokenSet.refresh_token }),
        });
        return (await this.fetchUserId(identifier));
    }
    async login(user) {
        return this.refresh(user);
    }
    async refresh(user) {
        let authData = user.auth_data;
        if (typeof authData === 'string') {
            try {
                authData = JSON.parse(authData);
            }
            catch {
                logger_1.default.warn(`[OAuth2] Session data isn't valid JSON: ${authData}`);
            }
        }
        if (authData === null || authData === void 0 ? void 0 : authData.refreshToken) {
            try {
                const tokenSet = await this.client.refresh(authData.refreshToken);
                // Update user refreshToken if provided
                if (tokenSet.refresh_token) {
                    await this.usersService.updateOne(user.id, {
                        auth_data: JSON.stringify({ refreshToken: tokenSet.refresh_token }),
                    });
                }
            }
            catch (e) {
                throw handleError(e);
            }
        }
    }
}
exports.OAuth2AuthDriver = OAuth2AuthDriver;
const handleError = (e) => {
    if (e instanceof openid_client_1.errors.OPError) {
        if (e.error === 'invalid_grant') {
            // Invalid token
            logger_1.default.trace(e, `[OAuth2] Invalid grant`);
            return new exceptions_1.InvalidTokenException();
        }
        // Server response error
        logger_1.default.trace(e, `[OAuth2] Unknown OP error`);
        return new exceptions_1.ServiceUnavailableException('Service returned unexpected response', {
            service: 'oauth2',
            message: e.error_description,
        });
    }
    else if (e instanceof openid_client_1.errors.RPError) {
        // Internal client error
        logger_1.default.trace(e, `[OAuth2] Unknown RP error`);
        return new exceptions_1.InvalidCredentialsException();
    }
    logger_1.default.trace(e, `[OAuth2] Unknown error`);
    return e;
};
function createOAuth2AuthRouter(providerName) {
    const router = (0, express_1.Router)();
    router.get('/', (req, res) => {
        const provider = (0, auth_1.getAuthProvider)(providerName);
        const codeVerifier = provider.generateCodeVerifier();
        const prompt = !!req.query.prompt;
        const token = jsonwebtoken_1.default.sign({ verifier: codeVerifier, redirect: req.query.redirect, prompt }, env_1.default.SECRET, {
            expiresIn: '5m',
            issuer: 'directus',
        });
        res.cookie(`oauth2.${providerName}`, token, {
            httpOnly: true,
            sameSite: 'lax',
        });
        return res.redirect(provider.generateAuthUrl(codeVerifier, prompt));
    }, respond_1.respond);
    router.get('/callback', (0, async_handler_1.default)(async (req, res, next) => {
        var _a;
        let tokenData;
        try {
            tokenData = jsonwebtoken_1.default.verify(req.cookies[`oauth2.${providerName}`], env_1.default.SECRET, { issuer: 'directus' });
        }
        catch (e) {
            logger_1.default.warn(e, `[OAuth2] Couldn't verify OAuth2 cookie`);
            throw new exceptions_1.InvalidCredentialsException();
        }
        const { verifier, redirect, prompt } = tokenData;
        const authenticationService = new services_1.AuthenticationService({
            accountability: {
                ip: (0, get_ip_from_req_1.getIPFromReq)(req),
                userAgent: req.get('user-agent'),
                role: null,
            },
            schema: req.schema,
        });
        let authResponse;
        try {
            res.clearCookie(`oauth2.${providerName}`);
            if (!req.query.code || !req.query.state) {
                logger_1.default.warn(`[OAuth2] Couldn't extract OAuth2 code or state from query: ${JSON.stringify(req.query)}`);
            }
            authResponse = await authenticationService.login(providerName, {
                code: req.query.code,
                codeVerifier: verifier,
                state: req.query.state,
            });
        }
        catch (error) {
            // Prompt user for a new refresh_token if invalidated
            if (error instanceof exceptions_1.InvalidTokenException && !prompt) {
                return res.redirect(`./?${redirect ? `redirect=${redirect}&` : ''}prompt=true`);
            }
            if (redirect) {
                let reason = 'UNKNOWN_EXCEPTION';
                if (error instanceof exceptions_1.ServiceUnavailableException) {
                    reason = 'SERVICE_UNAVAILABLE';
                }
                else if (error instanceof exceptions_1.InvalidCredentialsException) {
                    reason = 'INVALID_USER';
                }
                else if (error instanceof exceptions_1.InvalidTokenException) {
                    reason = 'INVALID_TOKEN';
                }
                else {
                    logger_1.default.warn(error, `[OAuth2] Unexpected error during OAuth2 login`);
                }
                return res.redirect(`${redirect.split('?')[0]}?reason=${reason}`);
            }
            logger_1.default.warn(error, `[OAuth2] Unexpected error during OAuth2 login`);
            throw error;
        }
        const { accessToken, refreshToken, expires } = authResponse;
        if (redirect) {
            res.cookie(env_1.default.REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
                httpOnly: true,
                domain: env_1.default.REFRESH_TOKEN_COOKIE_DOMAIN,
                maxAge: (0, ms_1.default)(env_1.default.REFRESH_TOKEN_TTL),
                secure: (_a = env_1.default.REFRESH_TOKEN_COOKIE_SECURE) !== null && _a !== void 0 ? _a : false,
                sameSite: env_1.default.REFRESH_TOKEN_COOKIE_SAME_SITE || 'strict',
            });
            return res.redirect(redirect);
        }
        res.locals.payload = {
            data: { access_token: accessToken, refresh_token: refreshToken, expires },
        };
        next();
    }), respond_1.respond);
    return router;
}
exports.createOAuth2AuthRouter = createOAuth2AuthRouter;
