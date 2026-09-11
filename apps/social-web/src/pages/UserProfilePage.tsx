import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  getErrorMessage,
  optimisticMutation,
  type Post,
  type Profile,
  type RelationshipStatus,
} from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { PostCard } from '../components/PostCard';
import { ReportModal } from '../components/ReportModal';
import { Avatar, Button } from '../components/ui';
import { Skeleton, SkeletonPost } from '../components/ui/Skeleton';

function ReportProfileButton({ personId }: { personId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Report
      </Button>
      <ReportModal
        open={open}
        onClose={() => setOpen(false)}
        targetType="user"
        targetId={personId}
      />
    </>
  );
}

const emptyRelation = (): RelationshipStatus => ({
  following: false,
  followedBy: false,
  friends: false,
  outgoingFriendRequest: false,
  incomingFriendRequest: false,
  incomingFriendRequestId: null,
  outgoingFriendRequestId: null,
  blocked: false,
  blockedBy: false,
  mutualFriendsCount: 0,
  muteScope: null,
  restricted: false,
  snoozed: false,
  snoozeExpiresAt: null,
  closeFriend: false,
  favorited: false,
  outgoingFollowRequest: false,
  incomingFollowRequest: false,
  incomingFollowRequestId: null,
  outgoingFollowRequestId: null,
});

export function UserProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { api, user, profile: me } = useAuth();
  const navigate = useNavigate();
  const [person, setPerson] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [relation, setRelation] = useState<RelationshipStatus>(emptyRelation());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isSelf = Boolean(me && person && me.id === person.id);

  useEffect(() => {
    if (!api || !user || !username) return;
    let active = true;

    void (async () => {
      setLoading(true);
      setError('');
      try {
        const found = await api.profiles.getByUsername(username);
        if (!active) return;
        if (!found) {
          setPerson(null);
          return;
        }
        if (me && found.id === me.id) {
          navigate('/profile', { replace: true });
          return;
        }
        setPerson(found);
        const [userPosts, status] = await Promise.all([
          api.posts.listByUser({ authorId: found.id, currentUserId: user.id }),
          api.friends.getRelationshipStatus(user.id, found.id),
        ]);
        if (!active) return;
        setPosts(userPosts);
        setRelation(status);
        if (status.blockedBy) {
          setPerson(null);
          setError('This profile is unavailable.');
        }
      } catch (err) {
        if (active) setError(getErrorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [api, user, username, me, navigate]);

  async function refreshRelation(otherId: string) {
    if (!api || !user) return;
    const status = await api.friends.getRelationshipStatus(user.id, otherId);
    setRelation(status);
  }

  async function onFollow() {
    if (!api || !user || !person || isSelf || relation.blocked) return;
    setBusy(true);
    setError('');
    const previousFollowing = relation.following;
    const previousPending = relation.outgoingFollowRequest;
    const previousPerson = person;

    try {
      await optimisticMutation({
        apply: () => {
          if (previousFollowing || previousPending) {
            setRelation((r) => ({
              ...r,
              following: false,
              outgoingFollowRequest: false,
              outgoingFollowRequestId: null,
            }));
            if (previousFollowing) {
              setPerson({
                ...previousPerson,
                followerCount: Math.max(0, previousPerson.followerCount - 1),
              });
            }
          } else if (person.isPrivate) {
            setRelation((r) => ({ ...r, outgoingFollowRequest: true }));
          } else {
            setRelation((r) => ({ ...r, following: true }));
            setPerson({
              ...previousPerson,
              followerCount: previousPerson.followerCount + 1,
            });
          }
        },
        mutation: async () => {
          const result = await api.follows.toggleFollow(user.id, person.id);
          await refreshRelation(person.id);
          const refreshed = await api.profiles.getById(person.id);
          if (refreshed) setPerson(refreshed);
          if (result.pendingRequest) {
            /* request sent */
          }
        },
        rollback: () => {
          setRelation((r) => ({
            ...r,
            following: previousFollowing,
            outgoingFollowRequest: previousPending,
          }));
          setPerson(previousPerson);
        },
        onError: (err) => setError(getErrorMessage(err)),
      });
    } finally {
      setBusy(false);
    }
  }

  async function onAcceptFollowRequest() {
    if (!api || !user || !person || !relation.incomingFollowRequestId) return;
    setBusy(true);
    setError('');
    try {
      await api.follows.acceptFollowRequest(relation.incomingFollowRequestId, user.id);
      await refreshRelation(person.id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRejectFollowRequest() {
    if (!api || !user || !person || !relation.incomingFollowRequestId) return;
    setBusy(true);
    setError('');
    try {
      await api.follows.rejectFollowRequest(relation.incomingFollowRequestId, user.id);
      await refreshRelation(person.id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onFriendAction() {
    if (!api || !user || !person || isSelf || relation.blocked) return;
    setBusy(true);
    setError('');
    try {
      if (relation.friends) {
        const ok = window.confirm(
          `Unfriend ${person.displayName}? You will still follow each other unless you unfollow.`,
        );
        if (!ok) return;
        await api.friends.removeFriend(user.id, person.id);
      } else if (relation.incomingFriendRequest && relation.incomingFriendRequestId) {
        await api.friends.acceptRequest(relation.incomingFriendRequestId, user.id);
      } else if (relation.outgoingFriendRequest && relation.outgoingFriendRequestId) {
        const ok = window.confirm('Cancel this friend request?');
        if (!ok) return;
        await api.friends.cancelRequest(relation.outgoingFriendRequestId, user.id);
      } else {
        await api.friends.sendRequest(user.id, person.id);
      }
      await refreshRelation(person.id);
      const refreshed = await api.profiles.getById(person.id);
      if (refreshed) setPerson(refreshed);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRejectIncoming() {
    if (!api || !user || !person || !relation.incomingFriendRequestId) return;
    setBusy(true);
    setError('');
    try {
      await api.friends.rejectRequest(relation.incomingFriendRequestId, user.id);
      await refreshRelation(person.id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onBlock() {
    if (!api || !user || !person || isSelf) return;
    const ok = window.confirm(
      `Block @${person.username}? This removes follows and friendship, and hides their content.`,
    );
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      await api.blocks.toggleBlock(user.id, person.id);
      navigate('/feed');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onMuteCycle() {
    if (!api || !user || !person) return;
    setBusy(true);
    setError('');
    try {
      // Cycle: none → all → posts → stories → none
      const next =
        relation.muteScope == null
          ? 'all'
          : relation.muteScope === 'all'
            ? 'posts'
            : relation.muteScope === 'posts'
              ? 'stories'
              : null;
      await api.relationships.setMute(user.id, person.id, next);
      await refreshRelation(person.id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRestrict() {
    if (!api || !user || !person) return;
    if (!relation.restricted) {
      const ok = window.confirm(
        `Restrict @${person.username}? Their comments stay mostly hidden from you, and their notifications are filtered.`,
      );
      if (!ok) return;
    }
    setBusy(true);
    setError('');
    try {
      await api.relationships.toggleRestrict(user.id, person.id);
      await refreshRelation(person.id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSnooze() {
    if (!api || !user || !person) return;
    setBusy(true);
    setError('');
    try {
      if (relation.snoozed) {
        await api.relationships.unsnooze(user.id, person.id);
      } else {
        const ok = window.confirm(
          `Snooze @${person.username} for 30 days? Their posts and stories will be hidden temporarily.`,
        );
        if (!ok) return;
        await api.relationships.snooze(user.id, person.id, 30);
      }
      await refreshRelation(person.id);
      if (!relation.snoozed) {
        setPosts([]);
      } else {
        const userPosts = await api.posts.listByUser({
          authorId: person.id,
          currentUserId: user.id,
        });
        setPosts(userPosts);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onCloseFriend() {
    if (!api || !user || !person) return;
    setBusy(true);
    setError('');
    try {
      await api.relationships.toggleCloseFriend(user.id, person.id);
      await refreshRelation(person.id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onFavorite() {
    if (!api || !user || !person) return;
    setBusy(true);
    setError('');
    try {
      await api.relationships.toggleFavorite(user.id, person.id);
      await refreshRelation(person.id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onMessage() {
    if (!api || !user || !person || relation.blocked || relation.blockedBy) return;
    setBusy(true);
    setError('');
    try {
      const conv = await api.messages.getOrCreateDM(user.id, person.id);
      navigate(`/messages/${conv.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function friendButtonLabel() {
    if (relation.friends) return 'Friends';
    if (relation.incomingFriendRequest) return 'Accept request';
    if (relation.outgoingFriendRequest) return 'Requested';
    return 'Add friend';
  }

  function muteLabel() {
    if (relation.muteScope === 'all') return 'Muted (all)';
    if (relation.muteScope === 'posts') return 'Muted (posts)';
    if (relation.muteScope === 'stories') return 'Muted (stories)';
    return 'Mute';
  }

  if (loading) {
    return (
      <section className="mx-auto w-full max-w-2xl space-y-4">
        <Skeleton className="h-36 w-full" />
        <SkeletonPost />
      </section>
    );
  }

  if (!person) {
    return (
      <section className="mx-auto w-full max-w-2xl rounded-[16px] border border-border bg-surface p-8 text-center">
        <h1 className="text-xl font-bold text-ink">User not found</h1>
        <p className="mt-1 text-sm text-muted">{error || `No profile for @${username}.`}</p>
        <Link to="/explore" className="mt-4 inline-block">
          <Button variant="secondary">Explore</Button>
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-2xl space-y-4">
      <div className="rounded-[16px] border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar src={person.avatarUrl} name={person.displayName} size={72} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-ink">{person.displayName}</h1>
            <p className="text-sm text-muted">@{person.username}</p>
            {person.bio ? <p className="mt-2 text-sm text-ink">{person.bio}</p> : null}
            <p className="mt-2 flex flex-wrap gap-4 text-sm text-muted">
              <Link to={`/u/${person.username}/connections`} className="hover:text-ink">
                <strong className="text-ink">{person.followerCount}</strong> followers
              </Link>
              <Link
                to={`/u/${person.username}/connections?tab=following`}
                className="hover:text-ink"
              >
                <strong className="text-ink">{person.followingCount}</strong> following
              </Link>
            </p>
            {relation.mutualFriendsCount > 0 ? (
              <p className="mt-1 text-xs text-muted">
                {relation.mutualFriendsCount} mutual friend
                {relation.mutualFriendsCount === 1 ? '' : 's'}
              </p>
            ) : null}
            {relation.followedBy && !relation.friends ? (
              <p className="mt-1 text-xs font-semibold text-primary">Follows you</p>
            ) : null}
          </div>
        </div>

        {error ? <p className="mt-3 text-sm font-semibold text-danger">{error}</p> : null}

        {!isSelf ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || relation.blocked} onClick={() => void onFollow()}>
                {relation.following
                  ? 'Following'
                  : relation.outgoingFollowRequest
                    ? 'Requested'
                    : person.isPrivate
                      ? 'Request follow'
                      : 'Follow'}
              </Button>
              {relation.incomingFollowRequest ? (
                <>
                  <Button disabled={busy} onClick={() => void onAcceptFollowRequest()}>
                    Accept follow
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void onRejectFollowRequest()}
                  >
                    Decline follow
                  </Button>
                </>
              ) : null}
              <Button
                variant="secondary"
                disabled={busy || relation.blocked}
                onClick={() => void onFriendAction()}
              >
                {friendButtonLabel()}
              </Button>
              {relation.incomingFriendRequest ? (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void onRejectIncoming()}
                >
                  Reject
                </Button>
              ) : null}
              <Button
                variant="secondary"
                disabled={busy || relation.blocked}
                onClick={() => void onMessage()}
              >
                Message
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || relation.blocked}
                onClick={() => void onMuteCycle()}
              >
                {muteLabel()}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || relation.blocked}
                onClick={() => void onRestrict()}
              >
                {relation.restricted ? 'Restricted' : 'Restrict'}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || relation.blocked}
                onClick={() => void onSnooze()}
              >
                {relation.snoozed ? 'Unsnooze' : 'Snooze 30d'}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || relation.blocked}
                onClick={() => void onCloseFriend()}
              >
                {relation.closeFriend ? 'Close friend' : 'Add close friend'}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || relation.blocked}
                onClick={() => void onFavorite()}
              >
                {relation.favorited ? 'Favorited' : 'Favorite'}
              </Button>
              <Button size="sm" variant="danger" disabled={busy} onClick={() => void onBlock()}>
                Block
              </Button>
              <ReportProfileButton personId={person.id} />
            </div>
          </div>
        ) : null}
      </div>

      <h2 className="text-lg font-bold text-ink">Posts</h2>
      <div className="space-y-4">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onChange={(next) => setPosts((prev) => prev.map((p) => (p.id === next.id ? next : p)))}
            onDelete={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
          />
        ))}
        {posts.length === 0 ? (
          <p className="rounded-[16px] border border-border bg-surface p-6 text-center text-sm text-muted">
            No posts yet.
          </p>
        ) : null}
      </div>
    </section>
  );
}
