import { Card, SkeletonPost } from '../components/ui';
import { Image, MapPin, Smile, Video } from 'lucide-react';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { useAuth } from '../auth/AuthProvider';

export function HomeShellPage() {
  const { profile, user } = useAuth();
  const name = profile?.displayName || user?.email || 'You';

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <p className="mb-3 text-sm font-semibold text-ink">Stories</p>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {['Add story', 'Ava', 'Noah', 'Mia', 'Leo'].map((label, index) => (
            <button key={label} type="button" className="w-16 shrink-0 text-center">
              <div
                className={`mx-auto grid h-14 w-14 place-items-center rounded-full ${
                  index === 0
                    ? 'border border-dashed border-border bg-surface-2 text-muted'
                    : 'bg-gradient-to-br from-primary to-primary-dark p-[2px]'
                }`}
              >
                <div className="grid h-full w-full place-items-center rounded-full bg-surface text-xs font-bold text-ink">
                  {index === 0 ? '+' : label.charAt(0)}
                </div>
              </div>
              <span className="mt-1 block truncate text-[11px] font-semibold text-muted">{label}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-start gap-3">
          <Avatar name={name} src={profile?.avatarUrl} size={44} />
          <div className="flex-1">
            <div className="rounded-[12px] bg-surface-2 px-4 py-3 text-sm text-muted">
              What&apos;s on your mind, {name.split(' ')[0]}?
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <Button variant="ghost" size="sm" type="button">
                <Image className="h-4 w-4" /> Photo
              </Button>
              <Button variant="ghost" size="sm" type="button">
                <Video className="h-4 w-4" /> Video
              </Button>
              <Button variant="ghost" size="sm" type="button">
                <Smile className="h-4 w-4" /> Feeling
              </Button>
              <Button variant="ghost" size="sm" type="button">
                <MapPin className="h-4 w-4" /> Place
              </Button>
              <Button className="ml-auto" size="sm" type="button">
                Post
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <SkeletonPost />
      <SkeletonPost />
    </div>
  );
}
