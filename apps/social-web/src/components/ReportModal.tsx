import { FormEvent, useState } from 'react';
import {
  getErrorMessage,
  t,
  type AppLanguageCode,
  type ReportTargetType,
} from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { Button, Label, Textarea } from './ui';

const REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'hate', label: 'Hate speech' },
  { value: 'nudity', label: 'Nudity or sexual content' },
  { value: 'violence', label: 'Violence or dangerous acts' },
  { value: 'misinfo', label: 'False information' },
  { value: 'other', label: 'Other' },
];

type ReportModalProps = {
  open: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  language?: AppLanguageCode;
};

export function ReportModal({
  open,
  onClose,
  targetType,
  targetId,
  language = 'en',
}: ReportModalProps) {
  const { api, user } = useAuth();
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  if (!open) return null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!api || !user) return;
    setBusy(true);
    setError('');
    try {
      await api.reports.create({
        reporterId: user.id,
        targetType,
        targetId,
        reason,
        details,
      });
      await api.settings.logActivity(user.id, 'report.create', { targetType, targetId, reason });
      setDone(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t(language, 'report.title')}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-ink">{t(language, 'report.title')}</h2>
        <p className="mt-1 text-sm text-muted">
          Reporting {targetType}. Our team reviews every report.
        </p>

        {done ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm font-semibold text-success">{t(language, 'report.thanks')}</p>
            <Button type="button" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={(e) => void onSubmit(e)}>
            <div>
              <Label>Reason</Label>
              <select
                className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-ink"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Details (optional)</Label>
              <Textarea value={details} onChange={(e) => setDetails(e.target.value)} />
            </div>
            {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? 'Sending…' : t(language, 'report.submit')}
              </Button>
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/** Compact inline report trigger for comments / messages */
export function ReportButton({
  targetType,
  targetId,
  className,
}: {
  targetType: ReportTargetType;
  targetId: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className ?? 'text-xs font-semibold text-muted hover:text-danger'}
        onClick={() => setOpen(true)}
      >
        Report
      </button>
      <ReportModal
        open={open}
        onClose={() => setOpen(false)}
        targetType={targetType}
        targetId={targetId}
      />
    </>
  );
}
