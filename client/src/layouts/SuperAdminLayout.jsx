import AppShell from './AppShell.jsx';
import { SUPER_ADMIN_NAV } from '../utils/navigation.js';
import { useNotifications } from '../context/NotificationContext.jsx';

export default function SuperAdminLayout() {
  const { unread } = useNotifications();

  return (
    <AppShell
      nav={SUPER_ADMIN_NAV}
      portalName="Production Control"
      portalHome="/super-admin"
      badges={{ unreadNotifications: unread }}
    />
  );
}
