export interface PostSummary {
  id: string;
  userId: string;
  title: string;
  body: string;
  courseCode: string | null;
  professorName: string | null;
  isAnonymous: boolean;
  generalTags: string[];
  authorDisplayName: string;
  createdAt: string;
  updatedAt: string;
  replyCount: number;
  upvoteCount: number;
  downvoteCount: number;
  userHasUpvoted: boolean;
  userHasDownvoted: boolean;
}

export interface ReplyOut {
  id: string;
  postId: string;
  userId: string;
  body: string;
  parentReplyId: string | null;
  isAnonymous: boolean;
  isDeleted: boolean;
  editedAt: string | null;
  authorDisplayName: string;
  createdAt: string;
  updatedAt: string;
  upvoteCount: number;
  downvoteCount: number;
  userHasUpvoted: boolean;
  userHasDownvoted: boolean;
  attachments?: PostAttachment[];
}

export interface PostAttachment {
  id: string;
  storagePath: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  signedUrl?: string;
}

export interface PostDetail extends PostSummary {
  replies: ReplyOut[];
  attachments: PostAttachment[];
}

export interface PostListResponse {
  posts: PostSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreatePostPayload {
  title: string;
  body: string;
  courseCode?: string;
  professorName?: string;
  isAnonymous?: boolean;
  generalTags?: string[];
  attachmentPaths?: string[];
}

export interface CreateReplyPayload {
  body: string;
  parentReplyId?: string;
  isAnonymous?: boolean;
  attachmentPaths?: string[];
}

export interface UpvoteResponse {
  upvoted: boolean;
  upvoteCount: number;
}

export interface VoteResponse {
  voted: boolean;
  upvoteCount: number;
  downvoteCount: number;
}

export interface NotificationOut {
  id: string;
  userId: string;
  type: string;
  payload: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

export type SortBy = "newest" | "best";
