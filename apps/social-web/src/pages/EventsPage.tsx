import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage, type Event, type EventInvite } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { Button, Input, Label, Textarea } from '../components/ui';
import { Skeleton } from '../components/ui/Skeleton';

export function EventsPage() {
  const { api, user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [invites, setInvites] = useState<EventInvite[]>([]);
  const [goingIds, setGoingIds] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [location, setLocation] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const [meetingUrl, setMeetingUrl] = useState('');
  const [recurrence, setRecurrence] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function load() {
    if (!api || !user) return;
    setLoading(true);
    setError('');
    try {
      const [list, myInvites] = await Promise.all([
        api.events.list({ limit: 40 }),
        api.events.listMyInvites(user.id),
      ]);
      setEvents(list);
      setInvites(myInvites);
      const memberships = await Promise.all(
        list.map(async (ev) => {
          try {
            const members = await api.events.listMembers(ev.id, { limit: 100 });
            const mine = members.find((m) => m.userId === user.id && m.status === 'going');
            return mine ? ev.id : null;
          } catch {
            return null;
          }
        }),
      );
      setGoingIds(new Set(memberships.filter((id): id is string => Boolean(id))));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, user]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!api || !user || !title.trim() || !startsAt) return;
    setCreating(true);
    setError('');
    try {
      const iso = new Date(startsAt).toISOString();
      const created = await api.events.create({
        title: title.trim(),
        hostId: user.id,
        startsAt: iso,
        description: description.trim() || null,
        location: location.trim() || null,
        isOnline,
        meetingUrl: meetingUrl.trim() || null,
        recurrenceRule: recurrence.trim() || null,
      });
      await api.events.join(created.id, user.id, 'going');
      setTitle('');
      setDescription('');
      setStartsAt('');
      setLocation('');
      setMeetingUrl('');
      setRecurrence('');
      setIsOnline(false);
      setEvents((prev) => [...prev, created].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
      setGoingIds((prev) => new Set([...prev, created.id]));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  async function onToggle(ev: Event) {
    if (!api || !user) return;
    const going = goingIds.has(ev.id);
    setBusyId(ev.id);
    setError('');
    try {
      if (going) {
        await api.events.leave(ev.id, user.id);
        setGoingIds((prev) => {
          const next = new Set(prev);
          next.delete(ev.id);
          return next;
        });
      } else {
        await api.events.join(ev.id, user.id, 'going');
        setGoingIds((prev) => new Set([...prev, ev.id]));
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(ev: Event) {
    if (!api || !user || ev.hostId !== user.id) return;
    const ok = window.confirm(`Delete event “${ev.title}”?`);
    if (!ok) return;
    setBusyId(ev.id);
    setError('');
    try {
      await api.events.delete(ev.id, user.id);
      setEvents((prev) => prev.filter((x) => x.id !== ev.id));
      setGoingIds((prev) => {
        const next = new Set(prev);
        next.delete(ev.id);
        return next;
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function respondInvite(invite: EventInvite, status: 'accepted' | 'declined') {
    if (!api || !user) return;
    try {
      await api.events.respondToInvite(invite.id, user.id, status);
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));
      if (status === 'accepted') {
        setGoingIds((prev) => new Set([...prev, invite.eventId]));
        void load();
      }
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <section className="mx-auto w-full max-w-2xl space-y-4">
      <header>
        <p className="text-xs font-bold tracking-wide text-primary uppercase">Happenings</p>
        <h1 className="text-2xl font-bold text-ink">Events</h1>
      </header>

      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}

      {invites.length > 0 ? (
        <div className="space-y-2 rounded-[16px] border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink">Invites</h2>
          {invites.map((inv) => (
            <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <Link to={`/events/${inv.eventId}`} className="font-semibold text-primary">
                Open event
              </Link>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void respondInvite(inv, 'accepted')}>
                  Accept
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void respondInvite(inv, 'declined')}>
                  Decline
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <form
        onSubmit={(e) => void onCreate(e)}
        className="space-y-3 rounded-[16px] border border-border bg-surface p-4 shadow-[var(--shadow-card)]"
      >
        <h2 className="text-sm font-semibold text-ink">Create an event</h2>
        <div>
          <Label htmlFor="event-title">Title</Label>
          <Input
            id="event-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Event title"
            required
            maxLength={120}
          />
        </div>
        <div>
          <Label htmlFor="event-desc">Description</Label>
          <Textarea
            id="event-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Details"
            maxLength={1000}
          />
        </div>
        <div>
          <Label htmlFor="event-starts">Starts at</Label>
          <Input
            id="event-starts"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="event-location">Location</Label>
          <Input
            id="event-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Venue or city"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={isOnline} onChange={(e) => setIsOnline(e.target.checked)} />
          Online event
        </label>
        {isOnline ? (
          <Input
            value={meetingUrl}
            onChange={(e) => setMeetingUrl(e.target.value)}
            placeholder="Meeting URL"
          />
        ) : null}
        <Input
          value={recurrence}
          onChange={(e) => setRecurrence(e.target.value)}
          placeholder="Recurrence (e.g. weekly, monthly)"
        />
        <Button type="submit" disabled={creating || !title.trim() || !startsAt}>
          {creating ? 'Creating…' : 'Create event'}
        </Button>
      </form>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : null}

      {!loading && events.length === 0 ? (
        <div className="rounded-[16px] border border-border bg-surface p-8 text-center">
          <p className="font-semibold text-ink">No events yet</p>
          <p className="mt-1 text-sm text-muted">Schedule something above.</p>
        </div>
      ) : null}

      <ul className="space-y-2">
        {events.map((ev) => {
          const going = goingIds.has(ev.id);
          return (
            <li
              key={ev.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-[14px] border border-border bg-surface p-4"
            >
              <div className="min-w-0">
                <Link to={`/events/${ev.id}`} className="text-sm font-semibold text-ink hover:underline">
                  {ev.title}
                </Link>
                {ev.description ? <p className="mt-1 text-sm text-muted">{ev.description}</p> : null}
                <p className="mt-1 text-xs text-muted">
                  {new Date(ev.startsAt).toLocaleString()}
                  {ev.isOnline ? ' · Online' : ''}
                  {ev.recurrenceRule ? ` · ${ev.recurrenceRule}` : ''}
                  {ev.host?.username ? ` · @${ev.host.username}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Link to={`/events/${ev.id}`}>
                  <Button size="sm" variant="secondary">
                    Open
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant={going ? 'secondary' : 'primary'}
                  disabled={busyId === ev.id}
                  onClick={() => void onToggle(ev)}
                >
                  {going ? 'Leave' : 'Going'}
                </Button>
                {user && ev.hostId === user.id ? (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busyId === ev.id}
                    onClick={() => void onDelete(ev)}
                  >
                    Delete
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
