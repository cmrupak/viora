import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import type { Profile } from '@viora/core';
import { useAuth } from '../../auth/AuthProvider';
import { Card } from '../ui/Card';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';

export function RightSidebar() {
  const { api, user } = useAuth();
  const [suggestions, setSuggestions] = useState<Profile[]>([]);
  const [eventsCount, setEventsCount] = useState(0);

  useEffect(() => {
    if (!api || !user) return;
    let active = true;
    void (async () => {
      try {
        const [people, events] = await Promise.all([
          api.profiles.search('a', 8).catch(() => [] as Profile[]),
          api.events.list({ limit: 5 }).catch(() => []),
        ]);
        if (!active) return;
        setSuggestions(people.filter((p) => p.id !== user.id).slice(0, 5));
        setEventsCount(events.length);
      } catch {
        /* ignore sidebar errors */
      }
    })();
    return () => {
      active = false;
    };
  }, [api, user]);

  async function follow(person: Profile) {
    if (!api || !user) return;
    setSuggestions((prev) => prev.filter((p) => p.id !== person.id));
    try {
      await api.follows.toggleFollow(user.id, person.id);
    } catch {
      setSuggestions((prev) => [person, ...prev]);
    }
  }

  return (
    <aside className="sticky top-0 hidden h-full w-[320px] shrink-0 flex-col gap-4 overflow-hidden py-4 pl-4 xl:flex">
      <Card>
        <h3 className="mb-3 text-base font-semibold text-ink">Suggestions</h3>
        {suggestions.length === 0 ? (
          <p className="text-sm text-muted">No suggestions right now.</p>
        ) : (
          <div className="space-y-3">
            {suggestions.map((person) => (
              <div key={person.id} className="flex items-center gap-3">
                <Link to={`/u/${person.username}`}>
                  <Avatar src={person.avatarUrl} name={person.displayName} size={40} />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link to={`/u/${person.username}`} className="truncate text-sm font-semibold text-ink">
                    {person.displayName}
                  </Link>
                  <p className="truncate text-xs text-muted">@{person.username}</p>
                </div>
                <Button size="sm" variant="secondary" aria-label={`Follow ${person.displayName}`} onClick={() => void follow(person)}>
                  <UserPlus className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h3 className="mb-2 text-base font-semibold text-ink">Upcoming</h3>
        <p className="text-sm text-muted">
          {eventsCount > 0 ? (
            <>
              {eventsCount} event{eventsCount === 1 ? '' : 's'} available.{' '}
              <Link to="/events" className="font-semibold text-primary">
                Browse
              </Link>
            </>
          ) : (
            <>
              No upcoming events yet.{' '}
              <Link to="/events" className="font-semibold text-primary">
                Create one
              </Link>
            </>
          )}
        </p>
      </Card>
    </aside>
  );
}
