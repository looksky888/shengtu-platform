export type ErrorPayload = {
    code?: string;
    detail?: string | { error?: string | { message?: string; code?: string } };
    error?: string | { message?: string; code?: string };
    message?: string;
    cloudflare_error?: boolean;
    error_source?: string;
    type?: string;
};

function errorMessageFromValue(value: unknown): string {
    if (typeof value === "string") {
        return value;
    }
    if (!value || typeof value !== "object") {
        return "";
    }

    const item = value as { error?: unknown; message?: unknown };
    if (typeof item.message === "string") {
        return item.message;
    }
    return errorMessageFromValue(item.error);
}

function errorCodeFromValue(value: unknown): string {
    if (!value || typeof value !== "object") return "";
    const item = value as { code?: unknown; error?: unknown };
    if (typeof item.code === "string") return item.code;
    return errorCodeFromValue(item.error);
}

function isCloudflareEdgeErrorPayload(payload: unknown): boolean {
    if (typeof payload === "string") {
        const trimmed = payload.trim().toLowerCase();
        return (trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html")) && trimmed.includes("cloudflare");
    }
    if (!payload || typeof payload !== "object") {
        return false;
    }
    const item = payload as ErrorPayload;
    if (item.cloudflare_error === true) {
        return true;
    }
    if (typeof item.type === "string" && item.type.includes("cloudflare.com/errors/")) {
        return true;
    }
    return false;
}

export function resolveRequestErrorDetails(
    payload: unknown,
    status?: number,
    fallbackMessage?: string,
): { message: string; code?: string } {
    if (isCloudflareEdgeErrorPayload(payload)) {
        const statusLabel = status ? `HTTP ${status}` : "网关异常";
        return {
            message: `源站服务繁忙、正在重启或请求超时（Cloudflare ${statusLabel}），请稍后重试`,
            code: "cloudflare_edge_error",
        };
    }
    if (typeof payload === "string") {
        const trimmed = payload.trim();
        if (trimmed.toLowerCase().startsWith("<!doctype html") || trimmed.toLowerCase().startsWith("<html")) {
            return {
                message: `服务暂时不可用（HTTP ${status || 502}），请稍后重试`,
                code: "upstream_html_error",
            };
        }
    }
    const data = payload && typeof payload === "object" ? (payload as ErrorPayload) : undefined;
    const message =
        errorMessageFromValue(data?.detail) ||
        errorMessageFromValue(data?.error) ||
        (typeof data?.message === "string" ? data.message : "") ||
        fallbackMessage ||
        `请求失败 (${status || 500})`;
    const code =
        errorCodeFromValue(data?.detail) ||
        errorCodeFromValue(data?.error) ||
        (typeof data?.code === "string" ? data.code : "");
    return { message, code: code || undefined };
}
