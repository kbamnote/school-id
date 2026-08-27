import AppRoutes from './routes/AppRoutes.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { NotificationProvider } from './context/NotificationContext.jsx';

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        {/* Inside AuthProvider: it only polls once somebody is signed in. */}
        <NotificationProvider>
          <AppRoutes />
        </NotificationProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
