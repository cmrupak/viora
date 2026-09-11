import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getErrorMessage, type Event, type EventMember } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { Button, Input } from '../components/ui';
import { useToast } from '../components/ui/Toast';

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { api, user } = useAuth();
  const { push } = useToast();
  const [event, setEvent] = useState<Event | null>(null);
  const [members, setMembers] = useState<EventMember[]>([]);
  const [inviteUsername, setInviteUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    if (!api || !id) return;
    setLoading(true);
    setError('');
    try {
      const [ev, mems] = await Promise.all([
        api.events.getById(id),
        api.events.listMembers(id, { limit: 100 }),
      ]);
      setEvent(ev);
      setMembers(mems);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, id]);

  async function setRsvp(status: 'going' | 'interested' | 'declined') {
    if (!api || !user || !id) return;
    try {
      if (status === 'declined') {
        await api.events.leave(id, user.id);
        setMembers((prev) => prev.filter((m) => m.userId !== user.id));
      } else {
        const mem = await api.events.join(id, user.id, status);
        setMembers((prev) => {
          const without = prev.filter((m) => m.userId !== user.id);
          return [...without, mem];
        });
      }
      push('RSVP updated.', 'success');
    } catch (err) {
      push(getErrorMessage(err), 'error');
    }
  }

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    if (!api || !user || !id || !inviteUsername.trim()) return;
    try {
      const profile = await api.profiles.getByUsername(inviteUsername.trim().replace(/^@/, ''));
      if (!profile) throw new Error('User not found.');
      await api.events.invite(id, user.id, profile.id);
      setInviteUsername('');
      push('Invite sent.', 'success');
    } catch (err) {
      push(getErrorMessage(err), 'error');
    }
  }

  if (loading) return <p className="text-sm text-muted">Loading event…</p>;
  if (!event) return <p className="text-sm font-semibold text-danger">{error || 'Event not found.'}</p>;

  const mine = user ? members.find((m) => m.userId === user.id) : null;
  const going = members.filter((m) => m.status === 'going');
  const interested = members.filter((m) => m.status === 'interested');

  return (
    <section className="mx-auto w-full max-w-2xl space-y-4">
      <Link to="/events" className="text-xs font-semibold text-primary">
        ← Events
      </Link>
      <header>
        <p className="text-xs font-bold tracking-wide text-primary uppercase">
          {event.isOnline ? 'Online event' : 'Event'}
          {event.recurrenceRule ? ` · ${event.recurrenceRule}` : ''}
        </p>
        <h1 className="text-2xl font-bold text-ink">{event.title}</h1>
        {event.description ? <p className="mt-1 text-sm text-muted">{event.description}</p> : null}
        <p className="mt-2 text-sm text-ink">{new Date(event.startsAt).toLocaleString()}</p>
        {event.location ? <p className="text-sm text-muted">{event.location}</p> : null}
        {event.meetingUrl ? (
          <a
            href={event.meetingUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-primary"
          >
            Join meeting
          </a>
        ) : null}
        {event.groupId ? (
          <p className="mt-1 text-xs text-muted">
            Linked group:{' '}
            <Link to={`/groups/${event.groupId}`} className="text-primary">
              open
            </Link>
          </p>
        ) : null}
        {event.discussionPostId ? (
          <Link to={`/posts/${event.discussionPostId}`} className="text-sm font-semibold text-primary">
            Discussion thread
          </Link>
        ) : null}
      </header>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={mine?.status === 'going' ? 'primary' : 'secondary'}
          onClick={() => void setRsvp('going')}
        >
          Going ({going.length})
        </Button>
        <Button
          size="sm"
          variant={mine?.status === 'interested' ? 'primary' : 'secondary'}
          onClick={() => void setRsvp('interested')}
        >
          Interested ({interested.length})
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void setRsvp('declined')}>
          Can&apos;t go
        </Button>
      </div>

      {user && event.hostId === user.id ? (
        <form
          onSubmit={(e) => void onInvite(e)}
          className="flex gap-2 rounded-[16px] border border-border bg-surface p-3"
        >
          <Input
            value={inviteUsername}
            onChange={(e) => setInviteUsername(e.target.value)}
            placeholder="Invite @username"
          />
          <Button type="submit">Invite</Button>
        </form>
      ) : null}

      <div className="rounded-[16px] border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink">Going</h2>
        <ul className="space-y-1 text-sm text-muted">
          {going.map((m) => (
            <li key={m.id}>@{m.profile?.username || 'user'}</li>
          ))}
          {going.length === 0 ? <li>No one yet</li> : null}
        </ul>
      </div>
    </section>
  );
}
