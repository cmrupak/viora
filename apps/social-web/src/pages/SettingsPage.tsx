import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  getErrorMessage,
  LANGUAGE_OPTIONS,
  runAccountExport,
  runAccountHardDelete,
  t,
  type ActivityLogEntry,
  type AppLanguageCode,
  type BlockedUser,
  type CloseFriend,
  type DataExportRequest,
  type FeedFavorite,
  type LoginEvent,
  type MfaFactorSummary,
  type NotificationPrefs,
  type UserMute,
  type UserRestrict,
  type UserSettings,
  type UserSnooze,
} from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { useTheme } from '../design/ThemeProvider';
import { Avatar, Button, Card, Input, Label, Textarea } from '../components/ui';

export function SettingsPage() {
  const { api, user, profile, setProfile, logout } = useAuth();
  const { mode, setMode } = useTheme();
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [reportTargetId, setReportTargetId] = useState('');
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [mutes, setMutes] = useState<UserMute[]>([]);
  const [restricts, setRestricts] = useState<UserRestrict[]>([]);
  const [snoozes, setSnoozes] = useState<UserSnooze[]>([]);
  const [closeFriends, setCloseFriends] = useState<CloseFriend[]>([]);
  const [favorites, setFavorites] = useState<FeedFavorite[]>([]);

  async function loadLists() {
    if (!api || !user) return;
    const [b, m, r, s, c, f] = await Promise.all([
      api.blocks.listBlocked(user.id).catch(() => [] as BlockedUser[]),
      api.relationships.listMutes(user.id).catch(() => [] as UserMute[]),
      api.relationships.listRestricts(user.id).catch(() => [] as UserRestrict[]),
      api.relationships.listSnoozes(user.id).catch(() => [] as UserSnooze[]),
      api.relationships.listCloseFriends(user.id).catch(() => [] as CloseFriend[]),
      api.relationships.listFavorites(user.id).catch(() => [] as FeedFavorite[]),
    ]);
    setBlocked(b);
    setMutes(m);
    setRestricts(r);
    setSnoozes(s);
    setCloseFriends(c);
    setFavorites(f);
  }

  useEffect(() => {
    if (!api || !user) return;
    let active = true;
    void (async () => {
      try {
        if (active) await loadLists();
      } catch {
        /* ignore */
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, user]);

  async function onLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  async function onDeactivate() {
    if (!api || !user) return;
    const ok = window.confirm('Deactivate your account? You can contact support to restore it later.');
    if (!ok) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const next = await api.settings.deactivateAccount(user.id);
      setProfile(next);
      setStatus('Account deactivated.');
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onUnblock(entry: BlockedUser) {
    if (!api || !user) return;
    setBlocked((prev) => prev.filter((p) => p.id !== entry.id));
    try {
      await api.blocks.toggleBlock(user.id, entry.blockedId);
      setStatus(`Unblocked @${entry.blocked?.username ?? 'user'}`);
    } catch (err) {
      setBlocked((prev) => [...prev, entry]);
      setError(getErrorMessage(err));
    }
  }

  async function onReport(event: FormEvent) {
    event.preventDefault();
    if (!api || !user) return;
    const targetId = reportTargetId.trim();
    if (!targetId) {
      setError('Enter a user id or username target id to report.');
      return;
    }
    setBusy(true);
    setError('');
    setStatus('');
    try {
      let resolvedId = targetId;
      if (!targetId.includes('-')) {
        const hits = await api.profiles.search(targetId, 5);
        const match = hits.find((p) => p.username.toLowerCase() === targetId.toLowerCase());
        if (!match) throw new Error('User not found. Use an exact username or UUID.');
        resolvedId = match.id;
      }
      await api.reports.create({
        reporterId: user.id,
        targetType: 'user',
        targetId: resolvedId,
        reason: reportReason || 'other',
        details: reportDetails,
      });
      setStatus('Report submitted.');
      setReportReason('');
      setReportDetails('');
      setReportTargetId('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function PersonRow({
    name,
    username,
    avatarUrl,
    meta,
    actionLabel,
    onAction,
  }: {
    name: string;
    username?: string | null;
    avatarUrl?: string | null;
    meta?: string;
    actionLabel: string;
    onAction: () => void;
  }) {
    return (
      <li className="flex items-center gap-3">
        {username ? (
          <Link to={`/u/${username}`}>
            <Avatar src={avatarUrl} name={name} size={36} />
          </Link>
        ) : (
          <Avatar src={avatarUrl} name={name} size={36} />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{name}</p>
          {username ? <p className="truncate text-xs text-muted">@{username}</p> : null}
          {meta ? <p className="truncate text-xs text-muted">{meta}</p> : null}
        </div>
        <Button size="sm" variant="secondary" onClick={onAction}>
          {actionLabel}
        </Button>
      </li>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <Card>
        <p className="text-xs font-bold tracking-wide text-primary uppercase">Settings</p>
        <h1 className="mt-1 text-2xl font-bold text-ink">Account</h1>
        <p className="mt-1 text-sm text-muted">
          {profile?.displayName || 'Member'} · {user?.email}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to="/profile">
            <Button variant="secondary">Edit profile</Button>
          </Link>
          <Link to="/audience-lists">
            <Button variant="secondary">Audience lists</Button>
          </Link>
          <Button variant="ghost" onClick={() => void onLogout()}>
            Log out
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => void onDeactivate()}>
            Deactivate account
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ink">Notification preferences</h2>
        <p className="mt-1 text-sm text-muted">Choose which activity reaches your inbox.</p>
        <NotificationPrefsPanel />
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ink">Safety &amp; privacy</h2>
        <p className="mt-1 text-sm text-muted">Sensitive filters, language, and accessibility.</p>
        <UserSettingsPanel />
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ink">Two-factor authentication</h2>
        <p className="mt-1 text-sm text-muted">Protect your account with an authenticator app (TOTP).</p>
        <MfaPanel />
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ink">Login activity</h2>
        <LoginActivityPanel />
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ink">Your activity</h2>
        <ActivityLogPanel />
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ink">Download your data</h2>
        <DataExportPanel />
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ink">Delete account</h2>
        <HardDeletePanel onDeleted={onLogout} />
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ink">Comment keyword filters</h2>
        <p className="mt-1 text-sm text-muted">
          Hide comments containing these words on your posts.
        </p>
        <KeywordFilters />
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ink">Appearance</h2>
        <p className="mt-1 text-sm text-muted">Theme preference is saved on this device.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(['light', 'dark'] as const).map((option) => (
            <Button
              key={option}
              size="sm"
              variant={mode === option ? 'primary' : 'secondary'}
              onClick={() => setMode(option)}
            >
              {option === 'light' ? 'Light' : 'Dark'}
            </Button>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ink">Muted</h2>
        {mutes.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No muted accounts.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {mutes.map((entry) => (
              <PersonRow
                key={entry.id}
                name={entry.target?.displayName || 'User'}
                username={entry.target?.username}
                avatarUrl={entry.target?.avatarUrl}
                meta={`Scope: ${entry.scope}`}
                actionLabel="Unmute"
                onAction={() => {
                  if (!api || !user) return;
                  void (async () => {
                    setMutes((prev) => prev.filter((m) => m.id !== entry.id));
                    try {
                      await api.relationships.setMute(user.id, entry.targetId, null);
                    } catch (err) {
                      setMutes((prev) => [...prev, entry]);
                      setError(getErrorMessage(err));
                    }
                  })();
                }}
              />
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ink">Restricted</h2>
        {restricts.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No restricted accounts.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {restricts.map((entry) => (
              <PersonRow
                key={entry.id}
                name={entry.target?.displayName || 'User'}
                username={entry.target?.username}
                avatarUrl={entry.target?.avatarUrl}
                actionLabel="Unrestrict"
                onAction={() => {
                  if (!api || !user) return;
                  void (async () => {
                    setRestricts((prev) => prev.filter((m) => m.id !== entry.id));
                    try {
                      await api.relationships.toggleRestrict(user.id, entry.targetId);
                    } catch (err) {
                      setRestricts((prev) => [...prev, entry]);
                      setError(getErrorMessage(err));
                    }
                  })();
                }}
              />
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ink">Snoozed</h2>
        {snoozes.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No snoozed accounts.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {snoozes.map((entry) => (
              <PersonRow
                key={entry.id}
                name={entry.target?.displayName || 'User'}
                username={entry.target?.username}
                avatarUrl={entry.target?.avatarUrl}
                meta={`Until ${new Date(entry.expiresAt).toLocaleDateString()}`}
                actionLabel="Unsnooze"
                onAction={() => {
                  if (!api || !user) return;
                  void (async () => {
                    setSnoozes((prev) => prev.filter((m) => m.id !== entry.id));
                    try {
                      await api.relationships.unsnooze(user.id, entry.targetId);
                    } catch (err) {
                      setSnoozes((prev) => [...prev, entry]);
                      setError(getErrorMessage(err));
                    }
                  })();
                }}
              />
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ink">Close friends</h2>
        {closeFriends.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Add people from their profile.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {closeFriends.map((entry) => (
              <PersonRow
                key={entry.id}
                name={entry.friend?.displayName || 'User'}
                username={entry.friend?.username}
                avatarUrl={entry.friend?.avatarUrl}
                actionLabel="Remove"
                onAction={() => {
                  if (!api || !user) return;
                  void (async () => {
                    setCloseFriends((prev) => prev.filter((m) => m.id !== entry.id));
                    try {
                      await api.relationships.toggleCloseFriend(user.id, entry.friendId);
                    } catch (err) {
                      setCloseFriends((prev) => [...prev, entry]);
                      setError(getErrorMessage(err));
                    }
                  })();
                }}
              />
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ink">Favorites</h2>
        <p className="mt-1 text-sm text-muted">Favorited people appear higher in your following feed.</p>
        {favorites.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No favorites yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {favorites.map((entry) => (
              <PersonRow
                key={entry.id}
                name={entry.target?.displayName || 'User'}
                username={entry.target?.username}
                avatarUrl={entry.target?.avatarUrl}
                actionLabel="Remove"
                onAction={() => {
                  if (!api || !user) return;
                  void (async () => {
                    setFavorites((prev) => prev.filter((m) => m.id !== entry.id));
                    try {
                      await api.relationships.toggleFavorite(user.id, entry.targetId);
                    } catch (err) {
                      setFavorites((prev) => [...prev, entry]);
                      setError(getErrorMessage(err));
                    }
                  })();
                }}
              />
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ink">Blocked users</h2>
        {blocked.length === 0 ? (
          <p className="mt-2 text-sm text-muted">You haven&apos;t blocked anyone.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {blocked.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3">
                <Avatar src={entry.blocked?.avatarUrl} name={entry.blocked?.displayName} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{entry.blocked?.displayName}</p>
                  <p className="truncate text-xs text-muted">@{entry.blocked?.username}</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => void onUnblock(entry)}>
                  Unblock
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ink">Report a user</h2>
        <p className="mt-1 text-sm text-muted">
          Prefer reporting from a post, comment, profile, or DM. Or enter a username here.
        </p>
        <form className="mt-4 space-y-3" onSubmit={(e) => void onReport(e)}>
          <div>
            <Label>Username or user id</Label>
            <Input
              value={reportTargetId}
              onChange={(e) => setReportTargetId(e.target.value)}
              placeholder="@username or uuid"
            />
          </div>
          <div>
            <Label>Reason</Label>
            <Input value={reportReason} onChange={(e) => setReportReason(e.target.value)} placeholder="spam, abuse, other…" />
          </div>
          <div>
            <Label>Details</Label>
            <Textarea value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} />
          </div>
          <Button type="submit" disabled={busy}>
            Submit report
          </Button>
        </form>
        {error ? <p className="mt-3 text-sm font-semibold text-danger">{error}</p> : null}
        {status ? <p className="mt-3 text-sm font-semibold text-success">{status}</p> : null}
      </Card>
    </div>
  );
}

function NotificationPrefsPanel() {
  const { api, user } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!api || !user) return;
    void (async () => {
      try {
        setPrefs(await api.notifications.getPrefs(user.id));
      } catch (err) {
        setError(getErrorMessage(err));
      }
    })();
  }, [api, user]);

  async function toggle(key: keyof Omit<NotificationPrefs, 'userId' | 'updatedAt'>) {
    if (!api || !user || !prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(true);
    try {
      const saved = await api.notifications.updatePrefs(user.id, { [key]: next[key] });
      setPrefs(saved);
    } catch (err) {
      setError(getErrorMessage(err));
      setPrefs(prefs);
    } finally {
      setSaving(false);
    }
  }

  if (!prefs) {
    return <p className="mt-2 text-sm text-muted">{error || 'Loading…'}</p>;
  }

  const rows: Array<{ key: keyof Omit<NotificationPrefs, 'userId' | 'updatedAt'>; label: string }> = [
    { key: 'likes', label: 'Likes' },
    { key: 'comments', label: 'Comments & replies' },
    { key: 'follows', label: 'New followers' },
    { key: 'messages', label: 'Messages' },
    { key: 'mentions', label: 'Mentions & tags' },
    { key: 'shares', label: 'Shares' },
    { key: 'birthdays', label: 'Birthdays' },
    { key: 'memories', label: 'On this day' },
    { key: 'pushEnabled', label: 'Push notifications (token ready)' },
  ];

  return (
    <div className="mt-3 space-y-2">
      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
      {rows.map((row) => (
        <label key={row.key} className="flex items-center justify-between gap-3 text-sm text-ink">
          <span>{row.label}</span>
          <input
            type="checkbox"
            checked={Boolean(prefs[row.key])}
            disabled={saving}
            onChange={() => void toggle(row.key)}
          />
        </label>
      ))}
    </div>
  );
}

function KeywordFilters() {
  const { api, user } = useAuth();
  const [items, setItems] = useState<Array<{ id: string; keyword: string }>>([]);
  const [keyword, setKeyword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!api || !user) return;
    void (async () => {
      try {
        setItems(await api.comments.listKeywordFilters(user.id));
      } catch {
        setItems([]);
      }
    })();
  }, [api, user]);

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    if (!api || !user || !keyword.trim()) return;
    setError('');
    try {
      const created = await api.comments.addKeywordFilter(user.id, keyword.trim());
      setItems((prev) => [...prev.filter((x) => x.id !== created.id), created]);
      setKeyword('');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function onRemove(id: string) {
    if (!api || !user) return;
    try {
      await api.comments.removeKeywordFilter(id, user.id);
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div className="mt-3 space-y-3">
      <form className="flex gap-2" onSubmit={(e) => void onAdd(e)}>
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="e.g. spam"
        />
        <Button type="submit" size="sm">
          Add
        </Button>
      </form>
      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
      {items.length === 0 ? (
        <p className="text-sm text-muted">No keyword filters yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm"
            >
              <span className="font-semibold text-ink">{item.keyword}</span>
              <Button size="sm" variant="ghost" onClick={() => void onRemove(item.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UserSettingsPanel() {
  const { api, user } = useAuth();
  const { setMode } = useTheme();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!api || !user) return;
    void (async () => {
      try {
        const next = await api.settings.getSettings(user.id);
        setSettings(next);
        document.documentElement.classList.toggle('reduce-motion', next.reduceMotion);
        if (next.themePreference === 'light' || next.themePreference === 'dark') {
          setMode(next.themePreference);
        }
      } catch (err) {
        setError(getErrorMessage(err));
      }
    })();
  }, [api, user, setMode]);

  async function patch(partial: Partial<UserSettings>) {
    if (!api || !user || !settings) return;
    const optimistic = { ...settings, ...partial };
    setSettings(optimistic);
    setSaving(true);
    try {
      const saved = await api.settings.updateSettings(user.id, {
        language: partial.language,
        hideSensitive: partial.hideSensitive,
        loginAlerts: partial.loginAlerts,
        reduceMotion: partial.reduceMotion,
        themePreference: partial.themePreference,
      });
      setSettings(saved);
      document.documentElement.classList.toggle('reduce-motion', saved.reduceMotion);
      if (saved.themePreference === 'light' || saved.themePreference === 'dark') {
        setMode(saved.themePreference);
      }
    } catch (err) {
      setError(getErrorMessage(err));
      setSettings(settings);
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return <p className="mt-2 text-sm text-muted">{error || 'Loading…'}</p>;
  }

  return (
    <div className="mt-3 space-y-3">
      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
      <label className="flex items-center justify-between gap-3 text-sm text-ink">
        <span>{t(settings.language, 'settings.sensitive')}</span>
        <input
          type="checkbox"
          checked={settings.hideSensitive}
          disabled={saving}
          onChange={() => void patch({ hideSensitive: !settings.hideSensitive })}
        />
      </label>
      <label className="flex items-center justify-between gap-3 text-sm text-ink">
        <span>{t(settings.language, 'settings.loginAlerts')}</span>
        <input
          type="checkbox"
          checked={settings.loginAlerts}
          disabled={saving}
          onChange={() => void patch({ loginAlerts: !settings.loginAlerts })}
        />
      </label>
      <label className="flex items-center justify-between gap-3 text-sm text-ink">
        <span>{t(settings.language, 'settings.reduceMotion')}</span>
        <input
          type="checkbox"
          checked={settings.reduceMotion}
          disabled={saving}
          onChange={() => void patch({ reduceMotion: !settings.reduceMotion })}
        />
      </label>
      <div>
        <Label>Language</Label>
        <select
          className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-ink"
          value={settings.language}
          disabled={saving}
          onChange={(e) => void patch({ language: e.target.value as AppLanguageCode })}
        >
          {LANGUAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>Theme preference</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {(['system', 'light', 'dark'] as const).map((option) => (
            <Button
              key={option}
              size="sm"
              variant={settings.themePreference === option ? 'primary' : 'secondary'}
              disabled={saving}
              onClick={() => void patch({ themePreference: option })}
            >
              {option}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MfaPanel() {
  const { api } = useAuth();
  const [factors, setFactors] = useState<MfaFactorSummary[]>([]);
  const [enrollId, setEnrollId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!api) return;
    try {
      setFactors(await api.security.listMfaFactors());
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  async function startEnroll() {
    if (!api) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const result = await api.security.enrollTotp();
      setEnrollId(result.id);
      setQr(result.totp?.qr_code ?? null);
      setSecret(result.totp?.secret ?? null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnroll() {
    if (!api || !enrollId || !code.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.security.challengeAndVerify(enrollId, code.trim());
      setStatus('Two-factor authentication enabled.');
      setEnrollId(null);
      setQr(null);
      setSecret(null);
      setCode('');
      await refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeFactor(id: string) {
    if (!api) return;
    setBusy(true);
    try {
      await api.security.unenrollFactor(id);
      setStatus('Authenticator removed.');
      await refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
      {status ? <p className="text-sm font-semibold text-success">{status}</p> : null}
      {factors.length === 0 ? (
        <p className="text-sm text-muted">No authenticator factors yet.</p>
      ) : (
        <ul className="space-y-2">
          {factors.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm"
            >
              <span className="text-ink">
                {f.friendlyName || f.factorType} · {f.status}
              </span>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void removeFactor(f.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {!enrollId ? (
        <Button size="sm" disabled={busy} onClick={() => void startEnroll()}>
          Set up authenticator
        </Button>
      ) : (
        <div className="space-y-2 rounded-xl border border-border p-3">
          {qr ? (
            <img src={qr} alt="Authenticator QR code" className="mx-auto h-40 w-40" />
          ) : null}
          {secret ? <p className="break-all text-xs text-muted">Secret: {secret}</p> : null}
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6-digit code"
            inputMode="numeric"
          />
          <Button size="sm" disabled={busy} onClick={() => void confirmEnroll()}>
            Verify &amp; enable
          </Button>
        </div>
      )}
    </div>
  );
}

function LoginActivityPanel() {
  const { api, user } = useAuth();
  const [items, setItems] = useState<LoginEvent[]>([]);

  useEffect(() => {
    if (!api || !user) return;
    void (async () => {
      setItems(await api.settings.listLoginEvents(user.id).catch(() => []));
    })();
  }, [api, user]);

  if (items.length === 0) {
    return <p className="mt-2 text-sm text-muted">No recorded sign-ins yet.</p>;
  }

  return (
    <ul className="mt-3 space-y-2">
      {items.map((item) => (
        <li key={item.id} className="rounded-xl border border-border px-3 py-2 text-sm">
          <p className="font-semibold text-ink">{item.deviceLabel || 'Device'}</p>
          <p className="text-xs text-muted">{new Date(item.createdAt).toLocaleString()}</p>
        </li>
      ))}
    </ul>
  );
}

function ActivityLogPanel() {
  const { api, user } = useAuth();
  const [items, setItems] = useState<ActivityLogEntry[]>([]);

  useEffect(() => {
    if (!api || !user) return;
    void (async () => {
      setItems(await api.settings.listActivity(user.id).catch(() => []));
    })();
  }, [api, user]);

  if (items.length === 0) {
    return <p className="mt-2 text-sm text-muted">No account activity logged yet.</p>;
  }

  return (
    <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
      {items.map((item) => (
        <li key={item.id} className="rounded-xl border border-border px-3 py-2 text-sm">
          <p className="font-semibold text-ink">{item.action}</p>
          <p className="text-xs text-muted">{new Date(item.createdAt).toLocaleString()}</p>
        </li>
      ))}
    </ul>
  );
}

function DataExportPanel() {
  const { api, user } = useAuth();
  const [items, setItems] = useState<DataExportRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  async function refresh() {
    if (!api || !user) return;
    setItems(await api.settings.listDataExports(user.id).catch(() => []));
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, user]);

  async function onRequest() {
    if (!api || !user) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const request = await api.settings.requestDataExport(user.id);
      const { data: sessionData } = await api.client.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Session expired. Sign in again.');
      const result = await runAccountExport(token, request.id);
      setStatus(result.message);
      if (result.downloadUrl) window.open(result.downloadUrl, '_blank', 'noopener,noreferrer');
      await refresh();
    } catch (err) {
      setError(getErrorMessage(err));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onDownload(item: DataExportRequest) {
    if (!api || !item.downloadPath) return;
    const url = await api.settings.getExportDownloadUrl(item.downloadPath);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm text-muted">
        Generates a JSON export of your profile, posts, comments, and settings.
      </p>
      <Button size="sm" disabled={busy} onClick={() => void onRequest()}>
        {busy ? 'Preparing…' : 'Request export'}
      </Button>
      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
      {status ? <p className="text-sm font-semibold text-success">{status}</p> : null}
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm"
            >
              <span className="text-ink">
                {item.status} · {new Date(item.createdAt).toLocaleString()}
              </span>
              {item.status === 'ready' && item.downloadPath ? (
                <Button size="sm" variant="secondary" onClick={() => void onDownload(item)}>
                  Download
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function HardDeletePanel({ onDeleted }: { onDeleted: () => Promise<void> }) {
  const { api, user } = useAuth();
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onDelete() {
    if (!api || !user) return;
    const ok = window.confirm(
      'This permanently deletes your account and cannot be undone. Continue?',
    );
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      const request = await api.settings.requestHardDelete(user.id);
      const { data: sessionData } = await api.client.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Session expired. Sign in again.');
      await runAccountHardDelete(token, request.id, phrase.trim() || 'DELETE');
      await onDeleted();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm text-muted">
        Soft deactivate keeps your data. Hard delete removes your Auth user and cascaded rows.
      </p>
      <div>
        <Label>Type DELETE to confirm</Label>
        <Input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="DELETE" />
      </div>
      <Button
        variant="danger"
        disabled={busy || phrase.trim() !== 'DELETE'}
        onClick={() => void onDelete()}
      >
        {busy ? 'Deleting…' : 'Permanently delete account'}
      </Button>
      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
    </div>
  );
}
