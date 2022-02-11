"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Url = void 0;
const url_1 = require("url");
class Url {
    constructor(url) {
        const parsedUrl = new url_1.URL(url, 'http://localhost');
        const isProtocolRelative = /^\/\//.test(url);
        const isRootRelative = /^\/$|^\/[^/]/.test(url);
        const isPathRelative = /^\./.test(url);
        this.protocol =
            !isProtocolRelative && !isRootRelative && !isPathRelative
                ? parsedUrl.protocol.substring(0, parsedUrl.protocol.length - 1)
                : null;
        this.host = !isRootRelative && !isPathRelative ? parsedUrl.hostname : null;
        this.port = parsedUrl.port !== '' ? parsedUrl.port : null;
        this.path = parsedUrl.pathname.split('/').filter((p) => p !== '');
        this.query = Object.fromEntries(parsedUrl.searchParams.entries());
        this.hash = parsedUrl.hash !== '' ? parsedUrl.hash.substring(1) : null;
    }
    isAbsolute() {
        return this.protocol !== null && this.host !== null;
    }
    isProtocolRelative() {
        return this.protocol === null && this.host !== null;
    }
    isRootRelative() {
        return this.protocol === null && this.host === null;
    }
    addPath(...paths) {
        const pathToAdd = paths.flatMap((p) => p.split('/')).filter((p) => p !== '');
        for (const pathSegment of pathToAdd) {
            if (pathSegment === '..') {
                this.path.pop();
            }
            else if (pathSegment !== '.') {
                this.path.push(pathSegment);
            }
        }
        return this;
    }
    setQuery(key, value) {
        this.query[key] = value;
        return this;
    }
    toString({ rootRelative } = { rootRelative: false }) {
        var _a;
        const protocol = this.protocol !== null ? `${this.protocol}:` : '';
        const host = (_a = this.host) !== null && _a !== void 0 ? _a : '';
        const port = this.port !== null ? `:${this.port}` : '';
        const origin = `${this.host !== null ? `${protocol}//` : ''}${host}${port}`;
        const path = `/${this.path.join('/')}`;
        const query = Object.keys(this.query).length !== 0
            ? `?${Object.entries(this.query)
                .map(([k, v]) => `${k}=${v}`)
                .join('&')}`
            : '';
        const hash = this.hash !== null ? `#${this.hash}` : '';
        return `${!rootRelative ? origin : ''}${path}${query}${hash}`;
    }
}
exports.Url = Url;
