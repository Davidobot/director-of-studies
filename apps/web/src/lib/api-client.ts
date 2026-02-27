"use client";

import { createClient } from "@/lib/supabase/client";

type UserScope = "studentId" | "parentId";

type ApiFetchOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: Record<string, unknown> | null;
  userScope?: UserScope;
  requireAuth?: boolean;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function getAuthContext() {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token || !session.user?.id) {
    throw new Error("Unauthorized");
  }

  return {
    accessToken: session.access_token,
    userId: session.user.id,
  };
}

export async function getCurrentUserId() {
  const auth = await getAuthContext();
  return auth.userId;
}

export async function apiFetch(path: string, options: ApiFetchOptions = {}) {
  const {
    method = "GET",
    query = {},
    body = null,
    userScope,
    requireAuth = true,
  } = options;

  const url = new URL(`${API_BASE}${path}`);
  const headers = new Headers();
  let payloadBody: Record<string, unknown> | null = body ? { ...body } : null;

  let auth: { accessToken: string; userId: string } | null = null;
  if (requireAuth || userScope) {
    auth = await getAuthContext();
    headers.set("Authorization", `Bearer ${auth.accessToken}`);
  }

  const mergedQuery = { ...query };
  if (userScope && auth) {
    if (method === "GET") {
      mergedQuery[userScope] = auth.userId;
    } else {
      payloadBody = { ...(payloadBody ?? {}), [userScope]: auth.userId };
    }
  }

  for (const [key, value] of Object.entries(mergedQuery)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }

  const init: RequestInit = { method, headers };
  if (payloadBody !== null && method !== "GET") {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(payloadBody);
  }

  return fetch(url.toString(), init);
}
