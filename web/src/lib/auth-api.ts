import { httpRequest } from "@/lib/request";
import type { Announcement, AnnouncementTarget, AuthProviders, LoginResponse } from "@/lib/api-types";

/**
 * Fallback only when /auth/providers is unreachable.
 * Canonical version is returned by backend as providers.terms.version
 * (source: internal/terms.Version).
 */
export const AUTH_TERMS_VERSION_FALLBACK = "2026-07-13";

let cachedTermsVersion: string | null = null;

export function getAuthTermsVersion() {
  return cachedTermsVersion || AUTH_TERMS_VERSION_FALLBACK;
}

export function setAuthTermsVersion(version?: string) {
  const next = String(version || "").trim();
  if (next) cachedTermsVersion = next;
}

export type AuthTermsPayload = {
  accept_terms: true;
  terms_version: string;
  remember_me?: boolean;
};

function termsPayload(rememberMe?: boolean): AuthTermsPayload {
  const payload: AuthTermsPayload = {
    accept_terms: true,
    terms_version: getAuthTermsVersion(),
  };
  if (typeof rememberMe === "boolean") {
    payload.remember_me = rememberMe;
  }
  return payload;
}

export async function login(username: string, password: string, options?: { rememberMe?: boolean }) {
  return httpRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: { username, password, ...termsPayload(options?.rememberMe) },
    redirectOnUnauthorized: false,
  });
}

export async function registerAccount(
  email: string,
  emailCode: string,
  password: string,
  name?: string,
  options?: { rememberMe?: boolean; inviteCode?: string },
) {
  return httpRequest<LoginResponse>("/auth/register", {
    method: "POST",
    body: {
      email,
      email_code: emailCode,
      password,
      name: name ?? "",
      invite_code: options?.inviteCode || "",
      ...termsPayload(options?.rememberMe),
    },
    redirectOnUnauthorized: false,
  });
}

export async function sendRegistrationEmailCode(email: string) {
  return httpRequest<{ sent: boolean; retry_after_seconds: number; expires_in_seconds: number }>("/auth/email-code", {
    method: "POST",
    body: { email },
    redirectOnUnauthorized: false,
  });
}

export async function sendPasswordResetEmailCode(email: string) {
  return httpRequest<{ sent: boolean; retry_after_seconds: number; expires_in_seconds: number }>(
    "/auth/password-reset/email-code",
    {
      method: "POST",
      body: { email },
      redirectOnUnauthorized: false,
    },
  );
}

export async function resetPasswordByEmail(email: string, emailCode: string, newPassword: string) {
  return httpRequest<{ ok: boolean }>("/auth/password-reset", {
    method: "POST",
    body: { email, email_code: emailCode, new_password: newPassword },
    redirectOnUnauthorized: false,
  });
}

export async function verifySession(token: string) {
  return httpRequest<LoginResponse>("/auth/session", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${String(token || "").trim()}`,
    },
    redirectOnUnauthorized: false,
  });
}

export async function logout() {
  return httpRequest<{ ok: boolean }>("/auth/logout", {
    method: "POST",
    redirectOnUnauthorized: false,
  });
}

export async function fetchAuthProviders() {
  const data = await httpRequest<AuthProviders>("/auth/providers", {
    redirectOnUnauthorized: false,
  });
  setAuthTermsVersion(data.terms?.version);
  return data;
}

export async function fetchVisibleAnnouncements(target: AnnouncementTarget) {
  const params = new URLSearchParams({ target });
  return httpRequest<{ items: Announcement[] }>(`/api/announcements?${params.toString()}`, {
    redirectOnUnauthorized: false,
  });
}

export async function fetchAdminAnnouncements() {
  return httpRequest<{ items: Announcement[] }>("/api/admin/announcements");
}

export async function createAnnouncement(announcement: {
  title: string;
  content: string;
  enabled: boolean;
  show_login: boolean;
  show_image: boolean;
  image_url?: string;
}) {
  return httpRequest<{ item: Announcement; items: Announcement[] }>("/api/admin/announcements", {
    method: "POST",
    body: announcement,
  });
}

export async function updateAnnouncement(
  announcementId: string,
  updates: Partial<Pick<Announcement, "title" | "content" | "image_url" | "enabled" | "show_login" | "show_image">>,
) {
  return httpRequest<{ item: Announcement; items: Announcement[] }>(`/api/admin/announcements/${announcementId}`, {
    method: "POST",
    body: updates,
  });
}

export async function deleteAnnouncement(announcementId: string) {
  return httpRequest<{ items: Announcement[] }>(`/api/admin/announcements/${announcementId}`, {
    method: "DELETE",
  });
}

export async function uploadAnnouncementImage(file: File) {
  const formData = new FormData();
  formData.append("image", file);
  formData.append("announcement_image_file", file);
  return httpRequest<{ image_url: string }>("/api/admin/announcements/upload-image", {
    method: "POST",
    body: formData,
  });
}
