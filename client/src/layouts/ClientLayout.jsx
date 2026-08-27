import AppShell from './AppShell.jsx';
import { CLIENT_NAV } from '../utils/navigation.js';
import { useNotifications } from '../context/NotificationContext.jsx';

export default function ClientLayout() {
  const { unread } = useNotifications();

  return (
    <AppShell
      nav={CLIENT_NAV}
      portalName="Client Portal"
      portalHome="/client"
      badges={{ unreadNotifications: unread }}
    />
  );
}
