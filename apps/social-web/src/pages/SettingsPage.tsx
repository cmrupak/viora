import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getErrorMessage, type BlockedUser } from '@viora/core';
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
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);

  useEffect(() => {
    if (!api || !user) return;
    let active = true;
    void (async () => {
      try {
        const list = await api.blocks.listBlocked(user.id);
        if (active) setBlocked(list);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      active = false;
    };
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
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await api.reports.create({
        reporterId: user.id,
        targetType: 'user',
        targetId: user.id,
        reason: reportReason || 'other',
        details: reportDetails,
      });
      setStatus('Report submitted.');
      setReportReason('');
      setReportDetails('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
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
          <Button variant="ghost" onClick={() => void onLogout()}>
            Log out
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => void onDeactivate()}>
            Deactivate account
          </Button>
        </div>
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
        <h2 className="text-lg font-semibold text-ink">Report an issue</h2>
        <form className="mt-4 space-y-3" onSubmit={(e) => void onReport(e)}>
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
