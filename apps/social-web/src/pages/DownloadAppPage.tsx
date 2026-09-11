import { Link } from 'react-router-dom';
import { Download, Smartphone, ShieldCheck, Sparkles } from 'lucide-react';
import { brand } from '../design/tokens';
import { Button } from '../components/ui';

const androidApkUrl =
  (import.meta.env.VITE_ANDROID_APK_URL as string | undefined)?.trim() ||
  '/downloads/viora-android.apk';

const iosUrl = (import.meta.env.VITE_IOS_APP_URL as string | undefined)?.trim() || '';

const hasCustomAndroid = Boolean((import.meta.env.VITE_ANDROID_APK_URL as string | undefined)?.trim());

export function DownloadAppPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe,var(--color-bg)_40%,#eff6ff)] px-4 py-10 dark:bg-[radial-gradient(circle_at_top_left,#1e3a8a,var(--color-bg)_45%,#0b1220)]">
      <div className="mx-auto w-full max-w-3xl">
        <Link to="/" className="inline-block font-[family-name:var(--font-display)] text-2xl font-bold text-primary">
          {brand.name}
        </Link>

        <div className="mt-8 overflow-hidden rounded-[24px] border border-border bg-surface shadow-[var(--shadow-card)]">
          <div className="bg-gradient-to-br from-primary via-primary-dark to-[#0f172a] px-6 py-10 text-white sm:px-10">
            <p className="text-xs font-bold tracking-[0.14em] text-white/80 uppercase">Get the app</p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold leading-tight sm:text-5xl">
              Install {brand.name} on your phone
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/80 sm:text-base">
              Same account as the web. Download the Android app, install it, and keep sharing from anywhere.
            </p>
          </div>

          <div className="space-y-6 p-6 sm:p-10">
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { icon: Download, title: 'Download', body: 'Get the latest Android APK.' },
                { icon: ShieldCheck, title: 'Allow install', body: 'Enable unknown apps if Android asks.' },
                { icon: Sparkles, title: 'Open & sign in', body: 'Use your existing Viora account.' },
              ].map((step) => {
                const Icon = step.icon;
                return (
                  <div key={step.title} className="rounded-[16px] border border-border bg-bg p-4">
                    <Icon className="h-5 w-5 text-primary" />
                    <p className="mt-3 text-sm font-semibold text-ink">{step.title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted">{step.body}</p>
                  </div>
                );
              })}
            </div>

            <div className="rounded-[20px] border border-border bg-bg p-5 sm:p-6">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-soft text-primary">
                  <Smartphone className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-ink">Android</h2>
                  <p className="mt-1 text-sm text-muted">
                    Direct APK install. Works with the same Supabase account you use on the web.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <a href={androidApkUrl} download={!hasCustomAndroid || androidApkUrl.startsWith('/')}>
                      <Button>
                        <Download className="h-4 w-4" />
                        Download Android APK
                      </Button>
                    </a>
                    <Link to="/register">
                      <Button variant="secondary">Create account first</Button>
                    </Link>
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    After download: open the file → Install → open {brand.name} → sign in.
                    {!hasCustomAndroid ? (
                      <>
                        {' '}
                        If the button 404s, place <code className="font-semibold">viora-android.apk</code> in{' '}
                        <code className="font-semibold">apps/social-web/public/downloads/</code> or set{' '}
                        <code className="font-semibold">VITE_ANDROID_APK_URL</code>.
                      </>
                    ) : null}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[20px] border border-border bg-bg p-5 sm:p-6">
              <h2 className="text-lg font-bold text-ink">iPhone / iPad</h2>
              <p className="mt-1 text-sm text-muted">
                {iosUrl
                  ? 'Install from the App Store when the listing is ready.'
                  : 'iOS build is not published yet. Use the web app for now, or ask for a TestFlight link later.'}
              </p>
              {iosUrl ? (
                <a href={iosUrl} className="mt-4 inline-block" target="_blank" rel="noreferrer">
                  <Button variant="secondary">Open App Store</Button>
                </a>
              ) : (
                <Link to="/" className="mt-4 inline-block">
                  <Button variant="ghost">Continue on web</Button>
                </Link>
              )}
            </div>

            <p className="text-center text-sm text-muted">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-primary">
                Sign in on web
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
