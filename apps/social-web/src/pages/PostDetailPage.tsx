import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  getErrorMessage,
  optimisticMutation,
  type Comment,
  type CommentSort,
  type Post,
} from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { PostCard } from '../components/PostCard';
import { ReportButton } from '../components/ReportModal';
import { Avatar, Button, Input } from '../components/ui';
import { Skeleton, SkeletonPost } from '../components/ui/Skeleton';

export function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { api, user, profile } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [sort, setSort] = useState<CommentSort>('oldest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const isPostOwner = Boolean(user && post && user.id === post.authorId);
  const commentsOff = Boolean(post?.commentsDisabled);

  async function loadComments(postId: string, nextSort = sort) {
    if (!api || !user) return;
    const next = await api.comments.list(postId, {
      currentUserId: user.id,
      sort: nextSort,
    });
    setComments(next);
  }

  useEffect(() => {
    if (!api || !user || !id) return;
    let active = true;

    void (async () => {
      setLoading(true);
      setError('');
      try {
        const [nextPost, nextComments] = await Promise.all([
          api.posts.getById(id, user.id),
          api.comments.list(id, { currentUserId: user.id, sort }),
        ]);
        if (!active) return;
        setPost(nextPost);
        setComments(nextComments);
      } catch (err) {
        if (active) setError(getErrorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, user, id]);

  async function onChangeSort(next: CommentSort) {
    if (!id) return;
    setSort(next);
    try {
      await loadComments(id, next);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function onComment(event: FormEvent) {
    event.preventDefault();
    if (!api || !user || !profile || !id || !body.trim() || commentsOff) return;
    setSending(true);
    setError('');

    const parentId = replyTo?.id ?? null;
    const tempId = `pending-comment-${Date.now()}`;
    const optimistic: Comment = {
      id: tempId,
      postId: id,
      authorId: user.id,
      parentId,
      body: body.trim(),
      likeCount: 0,
      likedByCurrentUser: false,
      pinnedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      status: 'pending',
      author: profile,
      replies: [],
    };
    const previousComments = comments;
    const previousPost = post;
    const text = body.trim();
    setBody('');
    setReplyTo(null);

    try {
      await optimisticMutation({
        apply: () => {
          if (parentId) {
            setComments((prev) =>
              prev.map((c) =>
                c.id === parentId
                  ? { ...c, replies: [...(c.replies ?? []), optimistic] }
                  : c,
              ),
            );
          } else {
            setComments((prev) => [...prev, optimistic]);
          }
          if (previousPost) {
            setPost({ ...previousPost, commentCount: previousPost.commentCount + 1 });
          }
        },
        mutation: async () => {
          const created = await api.comments.create({
            postId: id,
            authorId: user.id,
            body: text,
            parentId,
          });
          await loadComments(id);
          void created;
        },
        rollback: () => {
          setComments(previousComments);
          setPost(previousPost);
          setBody(text);
        },
        onError: (err) => setError(getErrorMessage(err)),
      });
    } finally {
      setSending(false);
    }
  }

  async function onLikeComment(comment: Comment) {
    if (!api || !user || comment.id.startsWith('pending-')) return;
    const previous = comments;
    const flip = (c: Comment): Comment =>
      c.id === comment.id
        ? {
            ...c,
            likedByCurrentUser: !c.likedByCurrentUser,
            likeCount: c.likedByCurrentUser
              ? Math.max(0, c.likeCount - 1)
              : c.likeCount + 1,
          }
        : {
            ...c,
            replies: (c.replies ?? []).map(flip),
          };
    setComments((prev) => prev.map(flip));
    try {
      await api.likes.toggleCommentLike(comment.id, user.id);
    } catch (err) {
      setComments(previous);
      setError(getErrorMessage(err));
    }
  }

  async function onDeleteComment(comment: Comment) {
    if (!api || !user || comment.authorId !== user.id) return;
    if (!window.confirm('Delete this comment?')) return;
    const previous = comments;
    setComments((prev) =>
      prev
        .filter((c) => c.id !== comment.id)
        .map((c) => ({
          ...c,
          replies: (c.replies ?? []).filter((r) => r.id !== comment.id),
        })),
    );
    try {
      await api.comments.softDelete(comment.id, user.id);
      if (post) setPost({ ...post, commentCount: Math.max(0, post.commentCount - 1) });
    } catch (err) {
      setComments(previous);
      setError(getErrorMessage(err));
    }
  }

  async function onSaveEdit(comment: Comment) {
    if (!api || !user) return;
    try {
      const updated = await api.comments.update(comment.id, user.id, editBody);
      setComments((prev) =>
        prev.map((c) => {
          if (c.id === comment.id) return { ...updated, replies: c.replies };
          return {
            ...c,
            replies: (c.replies ?? []).map((r) =>
              r.id === comment.id ? { ...updated, replies: r.replies } : r,
            ),
          };
        }),
      );
      setEditingId(null);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function onPinComment(comment: Comment) {
    if (!api || !user || !isPostOwner) return;
    try {
      const updated = await api.comments.pin(comment.id, user.id, !comment.pinnedAt);
      await loadComments(id!);
      void updated;
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function toggleCommentsDisabled() {
    if (!api || !user || !post || !isPostOwner) return;
    try {
      const next = await api.posts.setCommentsDisabled(post.id, user.id, !post.commentsDisabled);
      setPost(next);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  function renderComment(comment: Comment, isReply = false) {
    const isOwner = Boolean(user && comment.authorId === user.id);
    return (
      <li
        key={comment.id}
        className={`rounded-[12px] border border-border bg-surface-2/40 p-3 ${
          comment.status === 'pending' ? 'opacity-70' : ''
        } ${isReply ? 'ml-4 border-l-2' : ''}`}
      >
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Avatar
            src={comment.author?.avatarUrl}
            name={comment.author?.displayName || comment.author?.username || 'User'}
            size={28}
          />
          <Link
            to={`/u/${comment.author?.username ?? 'user'}`}
            className="text-sm font-semibold text-ink hover:underline"
          >
            {comment.author?.displayName || comment.author?.username || 'User'}
          </Link>
          {comment.pinnedAt ? (
            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-primary">
              Pinned
            </span>
          ) : null}
        </div>

        {editingId === comment.id ? (
          <div className="space-y-2">
            <Input value={editBody} onChange={(e) => setEditBody(e.target.value)} maxLength={1000} />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void onSaveEdit(comment)}>
                Save
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink">{comment.body}</p>
        )}

        <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-muted">
          <button type="button" onClick={() => void onLikeComment(comment)}>
            {comment.likedByCurrentUser ? 'Liked' : 'Like'} · {comment.likeCount}
          </button>
          {!isReply && !commentsOff ? (
            <button type="button" onClick={() => setReplyTo(comment)}>
              Reply
            </button>
          ) : null}
          {isOwner ? (
            <button
              type="button"
              onClick={() => {
                setEditingId(comment.id);
                setEditBody(comment.body);
              }}
            >
              Edit
            </button>
          ) : null}
          {isOwner ? (
            <button type="button" className="text-danger" onClick={() => void onDeleteComment(comment)}>
              Delete
            </button>
          ) : null}
          {isPostOwner && !isReply ? (
            <button type="button" onClick={() => void onPinComment(comment)}>
              {comment.pinnedAt ? 'Unpin' : 'Pin'}
            </button>
          ) : null}
          {!isOwner ? <ReportButton targetType="comment" targetId={comment.id} /> : null}
        </div>

        {!isReply && (comment.replies ?? []).length > 0 ? (
          <ul className="mt-3 space-y-2">
            {(comment.replies ?? []).map((reply) => renderComment(reply, true))}
          </ul>
        ) : null}
      </li>
    );
  }

  if (loading) {
    return (
      <section className="mx-auto w-full max-w-2xl space-y-4">
        <SkeletonPost />
        <Skeleton className="h-40 w-full" />
      </section>
    );
  }

  if (!post) {
    return (
      <section className="mx-auto w-full max-w-2xl rounded-[16px] border border-border bg-surface p-8 text-center">
        <h1 className="text-xl font-bold text-ink">Post not found</h1>
        <p className="mt-1 text-sm text-muted">{error || 'This post may have been removed.'}</p>
        <Link to="/feed" className="mt-4 inline-block">
          <Button variant="secondary">Back to feed</Button>
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-2xl space-y-4">
      <Link to="/feed" className="text-sm font-semibold text-primary hover:underline">
        ← Feed
      </Link>
      <PostCard
        post={post}
        onChange={setPost}
        onDelete={() => navigate('/feed', { replace: true })}
      />

      <div className="rounded-[16px] border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-ink">Comments</h2>
          <div className="flex flex-wrap gap-2">
            {(['oldest', 'newest', 'top'] as CommentSort[]).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={sort === s ? 'primary' : 'secondary'}
                onClick={() => void onChangeSort(s)}
              >
                {s === 'oldest' ? 'Oldest' : s === 'newest' ? 'Newest' : 'Top'}
              </Button>
            ))}
            {isPostOwner ? (
              <Button size="sm" variant="secondary" onClick={() => void toggleCommentsDisabled()}>
                {commentsOff ? 'Enable comments' : 'Disable comments'}
              </Button>
            ) : null}
          </div>
        </div>
        {error ? <p className="mb-2 text-sm font-semibold text-danger">{error}</p> : null}

        <ul className="mb-4 space-y-3">
          {comments.map((comment) => renderComment(comment))}
          {comments.length === 0 ? (
            <li className="text-sm text-muted">
              {commentsOff ? 'Comments are turned off.' : 'No comments yet.'}
            </li>
          ) : null}
        </ul>

        {commentsOff ? null : (
          <form onSubmit={(e) => void onComment(e)} className="space-y-2">
            {replyTo ? (
              <p className="text-xs text-muted">
                Replying to {replyTo.author?.displayName || replyTo.author?.username}{' '}
                <button type="button" className="font-semibold text-primary" onClick={() => setReplyTo(null)}>
                  Cancel
                </button>
              </p>
            ) : null}
            <div className="flex gap-2">
              <Input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={replyTo ? 'Write a reply…' : 'Add a comment…'}
                maxLength={1000}
                required
              />
              <Button type="submit" disabled={sending || !body.trim()}>
                {sending ? '…' : replyTo ? 'Reply' : 'Comment'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
