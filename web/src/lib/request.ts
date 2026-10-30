import axios, { AxiosError, AxiosHeaders, type AxiosRequestConfig } from "axios";

import webConfig from "@/constants/common-env";
import {type ErrorPayload, resolveRequestErrorDetails} from "@/lib/request-error-message";
import {
    buildLoginRedirectUrl,
    redirectAndRejectUnauthorized,
    shouldRedirectUnauthorized,
} from "@/lib/request-unauthorized";
import {clearStoredAuthSession, getStoredSessionToken} from "@/store/auth";

type RequestConfig = AxiosRequestConfig & {
    redirectOnUnauthorized?: boolean;
};

export class RequestError extends Error {
    status?: number;
    code?: string;

    constructor(message: string, options: { status?: number; code?: string } = {}) {
        super(message);
        this.name = "RequestError";
        this.status = options.status;
        this.code = options.code;
    }
}

const request = axios.create({
    baseURL: webConfig.apiUrl.replace(/\/$/, ""),
    withCredentials: true,
});

request.interceptors.request.use(async (config) => {
    const nextConfig = {...config};
    const sessionToken = await getStoredSessionToken();
    const headers = AxiosHeaders.from(nextConfig.headers);
    if (sessionToken && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${sessionToken}`);
    }
    nextConfig.headers = headers;
    return nextConfig;
});

request.interceptors.response.use(
    (response) => response,
    async (error: AxiosError<ErrorPayload>) => {
        const status = error.response?.status;
        const shouldRedirect = (error.config as RequestConfig | undefined)?.redirectOnUnauthorized !== false;
        if (
            typeof window !== "undefined" &&
            shouldRedirectUnauthorized(status, shouldRedirect, window.location.pathname)
        ) {
            return redirectAndRejectUnauthorized(
                clearStoredAuthSession,
                () =>
                    window.location.replace(
                        buildLoginRedirectUrl(
                            `${window.location.pathname}${window.location.search}${window.location.hash}`,
                        ),
                    ),
            );
        }

        const payload = error.response?.data;
        const {message, code} = resolveRequestErrorDetails(payload, status, error.message);
        return Promise.reject(new RequestError(message, { status, code }));
    },
);

type RequestOptions = {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    redirectOnUnauthorized?: boolean;
    signal?: AbortSignal;
};

export async function httpRequest<T>(path: string, options: RequestOptions = {}) {
    const {method = "GET", body, headers, redirectOnUnauthorized = true, signal} = options;
    const config: RequestConfig = {
        url: path,
        method,
        data: body,
        headers,
        redirectOnUnauthorized,
        signal,
    };
    const response = await request.request<T>(config);
    return response.data;
}
