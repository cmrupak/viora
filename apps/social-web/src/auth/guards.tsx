import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

export function ProtectedRoute() {
  const { ready, user, configured } = useAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg text-sm font-semibold text-muted">Loading…</div>
    );
  }

  if (!configured) {
    return <Navigate to="/setup" replace />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

export function GuestOnlyRoute() {
  const { ready, user } = useAuth();
  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg text-sm font-semibold text-muted">Loading…</div>
    );
  }
  if (user) return <Navigate to="/feed" replace />;
  return <Outlet />;
}
