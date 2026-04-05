import { createClient } from "@/lib/supabase/client";
import { getApiBaseUrl } from "@/lib/api/client";
import type {
  CreatePostPayload,
  CreateReplyPayload,
  PostDetail,
  PostListResponse,
  PostSummary,
} from "@/types/community";

async function getAccessToken(): Promise<string> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }
  return session.access_token;
}

export async function listPosts(opts?: {
  courseCode?: string;
  page?: number;
}): Promise<PostListResponse> {
  const token = await getAccessToken();
  const base = getApiBaseUrl();
  const params = new URLSearchParams();
  if (opts?.courseCode) params.set("course_code", opts.courseCode);
  if (opts?.page) params.set("page", String(opts.page));

  const res = await fetch(
    `${base}/api/community${params.size ? `?${params}` : ""}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`listPosts failed: ${res.status}`);
  return res.json() as Promise<PostListResponse>;
}

export async function getPost(postId: string): Promise<PostDetail> {
  const token = await getAccessToken();
  const res = await fetch(`${getApiBaseUrl()}/api/community/${postId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`getPost failed: ${res.status}`);
  return res.json() as Promise<PostDetail>;
}

export async function createPost(
  payload: CreatePostPayload,
): Promise<PostSummary> {
  const token = await getAccessToken();
  const res = await fetch(`${getApiBaseUrl()}/api/community`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    const msg = detail?.detail ?? `createPost failed: ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return res.json() as Promise<PostSummary>;
}

export async function createReply(
  postId: string,
  payload: CreateReplyPayload,
): Promise<PostDetail> {
  const token = await getAccessToken();
  const res = await fetch(
    `${getApiBaseUrl()}/api/community/${postId}/replies`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) throw new Error(`createReply failed: ${res.status}`);
  return res.json() as Promise<PostDetail>;
}
