import AppShell from './AppShell.jsx';
import { PORTAL_NAV } from '../utils/navigation.js';
import { useNotifications } from '../context/NotificationContext.jsx';

/** End-user portal. Same shell, lighter navigation, accent brand mark. */
export default function PortalLayout() {
  const { unread } = useNotifications();

  return (
    <AppShell
      nav={PORTAL_NAV}
      portalName="My Portal"
      portalHome="/portal"
      accent="accent"
      badges={{ unreadNotifications: unread }}
    />
  );
}
