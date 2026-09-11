import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getErrorMessage, optimisticMutation, type Comment, type Post } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { PostCard } from '../components/PostCard';
import { Avatar, Button, Input } from '../components/ui';
import { Skeleton, SkeletonPost } from '../components/ui/Skeleton';

export function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { api, user, profile } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!api || !user || !id) return;
    let active = true;

    void (async () => {
      setLoading(true);
      setError('');
      try {
        const [nextPost, nextComments] = await Promise.all([
          api.posts.getById(id, user.id),
          api.comments.list(id, { currentUserId: user.id }),
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
  }, [api, user, id]);

  async function onComment(event: FormEvent) {
    event.preventDefault();
    if (!api || !user || !profile || !id || !body.trim()) return;
    setSending(true);
    setError('');

    const tempId = `pending-comment-${Date.now()}`;
    const optimistic: Comment = {
      id: tempId,
      postId: id,
      authorId: user.id,
      parentId: null,
      body: body.trim(),
      likeCount: 0,
      likedByCurrentUser: false,
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

    try {
      await optimisticMutation({
        apply: () => {
          setComments((prev) => [...prev, optimistic]);
          if (previousPost) {
            setPost({ ...previousPost, commentCount: previousPost.commentCount + 1 });
          }
        },
        mutation: async () => {
          const created = await api.comments.create({
            postId: id,
            authorId: user.id,
            body: text,
          });
          setComments((prev) =>
            prev.map((c) => (c.id === tempId ? { ...created, status: 'ready', replies: [] } : c)),
          );
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
        <h2 className="mb-3 text-lg font-bold text-ink">Comments</h2>
        {error ? <p className="mb-2 text-sm font-semibold text-danger">{error}</p> : null}

        <ul className="mb-4 space-y-3">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className={`rounded-[12px] border border-border bg-surface-2/40 p-3 ${
                comment.status === 'pending' ? 'opacity-70' : ''
              }`}
            >
              <div className="mb-1 flex items-center gap-2">
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
                <span className="text-xs text-muted">@{comment.author?.username}</span>
              </div>
              <p className="text-sm text-ink">{comment.body}</p>
              {comment.replies?.map((reply) => (
                <div key={reply.id} className="mt-2 ml-4 border-l-2 border-border pl-3">
                  <p className="text-xs font-semibold text-ink">
                    {reply.author?.displayName || reply.author?.username}
                  </p>
                  <p className="text-sm text-muted">{reply.body}</p>
                </div>
              ))}
            </li>
          ))}
          {comments.length === 0 ? (
            <li className="text-sm text-muted">No comments yet.</li>
          ) : null}
        </ul>

        <form onSubmit={(e) => void onComment(e)} className="flex gap-2">
          <Input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment…"
            maxLength={1000}
            required
          />
          <Button type="submit" disabled={sending || !body.trim()}>
            {sending ? '…' : 'Reply'}
          </Button>
        </form>
      </div>
    </section>
  );
}
