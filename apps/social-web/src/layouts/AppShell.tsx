import { NavLink, Outlet } from 'react-router-dom';
import { BRAND } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';

const links = [
  { to: '/feed', label: 'Home' },
  { to: '/explore', label: 'Explore' },
  { to: '/create', label: 'Create' },
  { to: '/notifications', label: 'Alerts' },
  { to: '/messages', label: 'Inbox' },
  { to: '/profile', label: 'Profile' },
  { to: '/settings', label: 'Settings' },
];

export function AppShell() {
  const { profile, user, logout } = useAuth();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">{BRAND.name}</div>
        <p className="tagline">{profile?.displayName || user?.email || BRAND.tagline}</p>
        <nav className="nav">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <button type="button" className="btn ghost" style={{ marginTop: 20, width: '100%' }} onClick={() => void logout()}>
          Log out
        </button>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
