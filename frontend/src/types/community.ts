export interface PostSummary {
  id: string;
  userId: string;
  title: string;
  body: string;
  courseCode: string | null;
  professorName: string | null;
  isAnonymous: boolean;
  authorDisplayName: string;
  createdAt: string;
  updatedAt: string;
  replyCount: number;
  upvoteCount: number;
  userHasUpvoted: boolean;
}

export interface ReplyOut {
  id: string;
  postId: string;
  userId: string;
  body: string;
  authorDisplayName: string;
  createdAt: string;
  updatedAt: string;
}

export interface PostDetail extends PostSummary {
  replies: ReplyOut[];
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
}

export interface CreateReplyPayload {
  body: string;
}

export interface UpvoteResponse {
  upvoted: boolean;
  upvoteCount: number;
}

export interface NotificationOut {
  id: string;
  userId: string;
  type: string;
  payload: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}
