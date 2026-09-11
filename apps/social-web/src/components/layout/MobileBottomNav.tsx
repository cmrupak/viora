import { Bell, Clapperboard, Compass, Home, PlusSquare, User } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/feed', label: 'Home', icon: Home },
  { to: '/explore', label: 'Explore', icon: Compass },
  { to: '/create', label: 'Create', icon: PlusSquare },
  { to: '/reels', label: 'Reels', icon: Clapperboard },
  { to: '/notifications', label: 'Alerts', icon: Bell },
  { to: '/profile', label: 'Me', icon: User },
];

export function MobileBottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden"
      aria-label="Mobile primary"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-between gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <li key={tab.to} className="flex-1">
              <NavLink
                to={tab.to}
                className={({ isActive }) =>
                  `relative flex flex-col items-center gap-1 rounded-[12px] px-1 py-2 text-[11px] font-semibold ${
                    isActive ? 'text-primary' : 'text-muted'
                  }`
                }
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span>{tab.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
