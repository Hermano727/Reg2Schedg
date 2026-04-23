import { createClient } from "@/lib/supabase/client";
import { getApiBaseUrl } from "@/lib/api/client";
import type {
  CreatePostPayload,
  CreateReplyPayload,
  NotificationOut,
  PostAttachment,
  PostDetail,
  PostListResponse,
  PostSummary,
  SortBy,
  UpvoteResponse,
  VoteResponse,
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

async function readApiErrorMessage(res: Response, fallback: string): Promise<string> {
  const detail = await res.json().catch(() => null);
  const payload = detail?.detail ?? detail;
  if (typeof payload === "string") return payload;
  if (payload && typeof payload === "object") {
    if (typeof payload.message === "string") return payload.message;
    if (typeof payload.detail === "string") return payload.detail;
  }
  return fallback;
}

export async function listPosts(opts?: {
  courseCode?: string;
  professorName?: string;
  search?: string;
  sortBy?: SortBy;
  department?: string;
  courseNumber?: string;
  page?: number;
}): Promise<PostListResponse> {
  const token = await getAccessToken();
  const base = getApiBaseUrl();
  const params = new URLSearchParams();
  if (opts?.courseCode) params.set("course_code", opts.courseCode);
  if (opts?.professorName) params.set("professor_name", opts.professorName);
  if (opts?.search) params.set("search", opts.search);
  if (opts?.sortBy) params.set("sort_by", opts.sortBy);
  if (opts?.department) params.set("department", opts.department);
  if (opts?.courseNumber) params.set("course_number", opts.courseNumber);
  if (opts?.page) params.set("page", String(opts.page));

  const res = await fetch(
    `${base}/api/community${params.size ? `?${params}` : ""}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`listPosts failed: ${res.status}`);
  return res.json() as Promise<PostListResponse>;
}

export async function getDepartments(): Promise<string[]> {
  const token = await getAccessToken();
  const res = await fetch(`${getApiBaseUrl()}/api/community/departments`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`getDepartments failed: ${res.status}`);
  return res.json() as Promise<string[]>;
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
    throw new Error(await readApiErrorMessage(res, `createPost failed: ${res.status}`));
  }
  return res.json() as Promise<PostSummary>;
}

export async function deletePost(postId: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`${getApiBaseUrl()}/api/community/${postId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    const msg = detail?.detail ?? `deletePost failed: ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
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
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res, `createReply failed: ${res.status}`));
  }
  return res.json() as Promise<PostDetail>;
}

export async function toggleUpvote(postId: string): Promise<UpvoteResponse> {
  const token = await getAccessToken();
  const res = await fetch(
    `${getApiBaseUrl()}/api/community/${postId}/upvote`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!res.ok) throw new Error(`toggleUpvote failed: ${res.status}`);
  return res.json() as Promise<UpvoteResponse>;
}

export async function togglePostDownvote(postId: string): Promise<VoteResponse> {
  const token = await getAccessToken();
  const res = await fetch(
    `${getApiBaseUrl()}/api/community/${postId}/downvote`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!res.ok) throw new Error(`togglePostDownvote failed: ${res.status}`);
  return res.json() as Promise<VoteResponse>;
}

export async function toggleReplyUpvote(
  postId: string,
  replyId: string,
): Promise<VoteResponse> {
  const token = await getAccessToken();
  const res = await fetch(
    `${getApiBaseUrl()}/api/community/${postId}/replies/${replyId}/upvote`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!res.ok) throw new Error(`toggleReplyUpvote failed: ${res.status}`);
  return res.json() as Promise<VoteResponse>;
}

export async function editReply(postId: string, replyId: string, body: string): Promise<PostDetail> {
  const token = await getAccessToken();
  const res = await fetch(
    `${getApiBaseUrl()}/api/community/${postId}/replies/${replyId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ body }),
    },
  );
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    const msg = detail?.detail ?? `editReply failed: ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return res.json() as Promise<PostDetail>;
}

export async function deleteReply(postId: string, replyId: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(
    `${getApiBaseUrl()}/api/community/${postId}/replies/${replyId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    const msg = detail?.detail ?? `deleteReply failed: ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
}

export async function toggleReplyDownvote(
  postId: string,
  replyId: string,
): Promise<VoteResponse> {
  const token = await getAccessToken();
  const res = await fetch(
    `${getApiBaseUrl()}/api/community/${postId}/replies/${replyId}/downvote`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!res.ok) throw new Error(`toggleReplyDownvote failed: ${res.status}`);
  return res.json() as Promise<VoteResponse>;
}

export async function getNotifications(): Promise<NotificationOut[]> {
  const token = await getAccessToken();
  const res = await fetch(`${getApiBaseUrl()}/api/community/notifications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`getNotifications failed: ${res.status}`);
  return res.json() as Promise<NotificationOut[]>;
}

export async function markNotificationsRead(): Promise<void> {
  const token = await getAccessToken();
  await fetch(`${getApiBaseUrl()}/api/community/notifications/read`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function saveAttachmentToVault(opts: {
  attachment: PostAttachment;
  postId: string;
  postTitle: string;
  replyId?: string;
  replyPreview?: string;
}): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.from("vault_items").insert({
    user_id: user.id,
    name: opts.attachment.name,
    kind: "community",
    storage_path: opts.attachment.storagePath,
    mime_type: opts.attachment.mimeType,
    size_bytes: opts.attachment.sizeBytes,
    community_attachment_id: opts.attachment.id,
    community_post_id: opts.postId,
    community_reply_id: opts.replyId ?? null,
    community_post_title: opts.postTitle,
    community_reply_preview: opts.replyPreview ? opts.replyPreview.slice(0, 200) : null,
  });

  if (error) {
    if (error.code === "23505") throw new Error("already_saved");
    throw new Error(error.message);
  }
}
