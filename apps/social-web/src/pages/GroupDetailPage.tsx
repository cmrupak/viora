import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getErrorMessage,
  type BroadcastChannel,
  type BroadcastMessage,
  type Group,
  type GroupJoinQuestion,
  type GroupMember,
  type Post,
} from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { PostCard } from '../components/PostCard';
import { Button, Input, Textarea } from '../components/ui';
import { useToast } from '../components/ui/Toast';

export function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { api, user } = useAuth();
  const { push } = useToast();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [pending, setPending] = useState<GroupMember[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [pendingPosts, setPendingPosts] = useState<Post[]>([]);
  const [questions, setQuestions] = useState<GroupJoinQuestion[]>([]);
  const [channels, setChannels] = useState<BroadcastChannel[]>([]);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [broadcasts, setBroadcasts] = useState<BroadcastMessage[]>([]);
  const [postBody, setPostBody] = useState('');
  const [questionPrompt, setQuestionPrompt] = useState('');
  const [channelName, setChannelName] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isAdmin =
    Boolean(user && group && (group.ownerId === user.id || group.myMembership?.role === 'admin'));
  const isActiveMember =
    Boolean(user && group && (group.ownerId === user.id || group.myMembership?.status === 'active'));

  async function load() {
    if (!api || !user || !id) return;
    setLoading(true);
    setError('');
    try {
      const g = await api.groups.getById(id, user.id);
      setGroup(g);
      if (!g) return;
      const [mems, pens, feed, qs, chans] = await Promise.all([
        api.groups.listMembers(id, { status: 'active', limit: 100 }),
        api.groups.listMembers(id, { status: 'pending', limit: 50 }).catch(() => []),
        api.groups.listGroupPosts(id, { currentUserId: user.id, limit: 20 }),
        api.groups.listJoinQuestions(id),
        api.groups.listBroadcastChannels(id),
      ]);
      setMembers(mems);
      setPending(pens);
      setPosts(feed);
      setQuestions(qs);
      setChannels(chans);
      if (isAdmin || g.ownerId === user.id) {
        const pendingFeed = await api.groups
          .listGroupPosts(id, {
            currentUserId: user.id,
            approvalStatus: 'pending',
            limit: 20,
          })
          .catch(() => []);
        setPendingPosts(pendingFeed);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, user, id]);

  async function onPost(event: FormEvent) {
    event.preventDefault();
    if (!api || !user || !id || !postBody.trim()) return;
    try {
      const created = await api.groups.createGroupPost({
        groupId: id,
        authorId: user.id,
        body: postBody.trim(),
      });
      setPostBody('');
      if (group?.requiresPostApproval) {
        push('Post submitted for approval.', 'success');
        setPendingPosts((prev) => [created, ...prev]);
      } else {
        setPosts((prev) => [created, ...prev]);
        push('Posted.', 'success');
      }
    } catch (err) {
      push(getErrorMessage(err), 'error');
    }
  }

  async function approveMember(userId: string) {
    if (!api || !id) return;
    try {
      await api.groups.approveMember(id, userId);
      setPending((prev) => prev.filter((m) => m.userId !== userId));
      const refreshed = await api.groups.listMembers(id, { status: 'active', limit: 100 });
      setMembers(refreshed);
      push('Member approved.', 'success');
    } catch (err) {
      push(getErrorMessage(err), 'error');
    }
  }

  async function setRole(userId: string, role: 'admin' | 'member') {
    if (!api || !id) return;
    try {
      await api.groups.setMemberRole(id, userId, role);
      setMembers((prev) => prev.map((m) => (m.userId === userId ? { ...m, role } : m)));
      push(role === 'admin' ? 'Promoted to admin.' : 'Demoted to member.', 'success');
    } catch (err) {
      push(getErrorMessage(err), 'error');
    }
  }

  async function approvePost(postId: string) {
    if (!api || !id) return;
    try {
      await api.groups.setGroupPostApproval(id, postId, 'approved');
      const approved = pendingPosts.find((p) => p.id === postId);
      setPendingPosts((prev) => prev.filter((p) => p.id !== postId));
      if (approved) setPosts((prev) => [approved, ...prev]);
      push('Post approved.', 'success');
    } catch (err) {
      push(getErrorMessage(err), 'error');
    }
  }

  async function addQuestion(event: FormEvent) {
    event.preventDefault();
    if (!api || !id || !questionPrompt.trim()) return;
    try {
      const q = await api.groups.addJoinQuestion(id, questionPrompt.trim());
      setQuestions((prev) => [...prev, q]);
      setQuestionPrompt('');
    } catch (err) {
      push(getErrorMessage(err), 'error');
    }
  }

  async function createChannel(event: FormEvent) {
    event.preventDefault();
    if (!api || !user || !id || !channelName.trim()) return;
    try {
      const ch = await api.groups.createBroadcastChannel(id, user.id, channelName.trim());
      setChannels((prev) => [...prev, ch]);
      setChannelName('');
    } catch (err) {
      push(getErrorMessage(err), 'error');
    }
  }

  async function openChannel(channelId: string) {
    if (!api) return;
    setActiveChannel(channelId);
    try {
      const msgs = await api.groups.listBroadcastMessages(channelId);
      setBroadcasts(msgs);
    } catch (err) {
      push(getErrorMessage(err), 'error');
    }
  }

  async function sendBroadcast(event: FormEvent) {
    event.preventDefault();
    if (!api || !user || !activeChannel || !broadcastBody.trim()) return;
    try {
      const msg = await api.groups.postBroadcast(activeChannel, user.id, broadcastBody.trim());
      setBroadcasts((prev) => [msg, ...prev]);
      setBroadcastBody('');
    } catch (err) {
      push(getErrorMessage(err), 'error');
    }
  }

  if (loading) {
    return <p className="text-sm text-muted">Loading group…</p>;
  }
  if (!group) {
    return <p className="text-sm font-semibold text-danger">{error || 'Group not found.'}</p>;
  }

  return (
    <section className="mx-auto w-full max-w-2xl space-y-4">
      <Link to="/groups" className="text-xs font-semibold text-primary">
        ← Groups
      </Link>
      <header>
        <p className="text-xs font-bold tracking-wide text-primary uppercase">
          {group.visibility ?? (group.isPrivate ? 'private' : 'public')}
        </p>
        <h1 className="text-2xl font-bold text-ink">{group.name}</h1>
        {group.description ? <p className="mt-1 text-sm text-muted">{group.description}</p> : null}
        <p className="mt-1 text-xs text-muted">{members.length} members</p>
      </header>

      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}

      {isActiveMember ? (
        <form
          onSubmit={(e) => void onPost(e)}
          className="space-y-2 rounded-[16px] border border-border bg-surface p-4"
        >
          <Textarea
            value={postBody}
            onChange={(e) => setPostBody(e.target.value)}
            placeholder="Share with the group…"
          />
          <Button type="submit" disabled={!postBody.trim()}>
            {group.requiresPostApproval ? 'Submit for approval' : 'Post'}
          </Button>
        </form>
      ) : null}

      {isAdmin && pending.length > 0 ? (
        <div className="space-y-2 rounded-[16px] border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink">Join requests</h2>
          {pending.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
              <span>@{m.profile?.username || 'user'}</span>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void approveMember(m.userId)}>
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void api!.groups.rejectMember(id!, m.userId).then(() => {
                    setPending((prev) => prev.filter((x) => x.userId !== m.userId));
                  })}
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {isAdmin && pendingPosts.length > 0 ? (
        <div className="space-y-2 rounded-[16px] border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink">Pending posts</h2>
          {pendingPosts.map((p) => (
            <div key={p.id} className="flex items-start justify-between gap-2 border-b border-border py-2">
              <p className="text-sm text-ink">{p.body || '(media post)'}</p>
              <Button size="sm" onClick={() => void approvePost(p.id)}>
                Approve
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {isAdmin ? (
        <div className="space-y-3 rounded-[16px] border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink">Mod tools</h2>
          <form onSubmit={(e) => void addQuestion(e)} className="flex gap-2">
            <Input
              value={questionPrompt}
              onChange={(e) => setQuestionPrompt(e.target.value)}
              placeholder="Join question"
            />
            <Button type="submit">Add</Button>
          </form>
          <ul className="space-y-1 text-xs text-muted">
            {questions.map((q) => (
              <li key={q.id}>{q.prompt}</li>
            ))}
          </ul>
          <form onSubmit={(e) => void createChannel(e)} className="flex gap-2">
            <Input
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="Broadcast channel name"
            />
            <Button type="submit">Create</Button>
          </form>
          <div className="flex flex-wrap gap-2">
            {channels.map((c) => (
              <Button
                key={c.id}
                size="sm"
                variant={activeChannel === c.id ? 'primary' : 'secondary'}
                onClick={() => void openChannel(c.id)}
              >
                {c.name}
              </Button>
            ))}
          </div>
          {activeChannel ? (
            <form onSubmit={(e) => void sendBroadcast(e)} className="space-y-2">
              <Textarea
                value={broadcastBody}
                onChange={(e) => setBroadcastBody(e.target.value)}
                placeholder="Announcement…"
              />
              <Button type="submit">Broadcast</Button>
              <ul className="space-y-1 text-xs">
                {broadcasts.map((m) => (
                  <li key={m.id} className="text-ink">
                    {m.body}
                  </li>
                ))}
              </ul>
            </form>
          ) : null}
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase text-muted">Members</p>
            {members
              .filter((m) => m.role !== 'owner')
              .map((m) => (
                <div key={m.id} className="flex items-center justify-between text-sm">
                  <span>
                    @{m.profile?.username || 'user'} · {m.role}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void setRole(m.userId, m.role === 'admin' ? 'member' : 'admin')}
                  >
                    {m.role === 'admin' ? 'Demote' : 'Promote'}
                  </Button>
                </div>
              ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onChange={(next) => setPosts((prev) => prev.map((p) => (p.id === next.id ? next : p)))}
            onDelete={(pid) => setPosts((prev) => prev.filter((p) => p.id !== pid))}
          />
        ))}
        {posts.length === 0 ? (
          <p className="text-sm text-muted">No posts in this group yet.</p>
        ) : null}
      </div>
    </section>
  );
}
