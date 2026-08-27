import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { FullScreenLoader } from '../components/ui/Spinner.jsx';
import { portalFor } from '../utils/rbac.js';

/**
 * Route guard.
 *
 * Three gates, in order:
 *   1. signed in at all
 *   2. temporary password already replaced
 *   3. allowed in THIS portal (a client admin cannot wander into /super-admin)
 *
 * This is navigation UX. The API enforces the same rules independently.
 */
export default function ProtectedRoute({ roles, permissions, requireAll = true }) {
  const { user, initialising, isAuthenticated } = useAuth();
  const location = useLocation();

  if (initialising) return <FullScreenLoader />;

  if (!isAuthenticated) {
    // Remember where they were headed so sign-in can return them there.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  if (roles?.length && !roles.includes(user.role)) {
    return <Navigate to={portalFor(user.role)} replace />;
  }

  if (permissions?.length) {
    const held = user.permissions || [];
    const allowed = requireAll
      ? permissions.every((p) => held.includes(p))
      : permissions.some((p) => held.includes(p));
    if (!allowed) return <Navigate to="/403" replace />;
  }

  return <Outlet />;
}

/** Keeps a signed-in user away from the sign-in screen. */
export function PublicOnlyRoute() {
  const { user, initialising, isAuthenticated } = useAuth();

  if (initialising) return <FullScreenLoader />;
  if (isAuthenticated) {
    return <Navigate to={user.mustChangePassword ? '/change-password' : portalFor(user.role)} replace />;
  }
  return <Outlet />;
}
