export interface PostSummary {
  id: string;
  userId: string;
  title: string;
  body: string;
  courseCode: string | null;
  authorDisplayName: string;
  createdAt: string;
  updatedAt: string;
  replyCount: number;
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
}

export interface CreateReplyPayload {
  body: string;
}
