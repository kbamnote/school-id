import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  BellOff,
  CheckCheck,
  AlertTriangle,
  CheckCircle2,
  Info,
  XOctagon,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { notificationsApi } from '../../api/activityApi.js';
import { errorMessage } from '../../api/client';
import { useNotifications } from '../../context/NotificationContext.jsx';
import { formatRelative } from '../../utils/format.js';

const SEVERITY = {
  info: { icon: Info, tone: 'text-info-600 bg-info-50' },
  success: { icon: CheckCircle2, tone: 'text-success-600 bg-success-50' },
  warning: { icon: AlertTriangle, tone: 'text-warning-600 bg-warning-50' },
  critical: { icon: XOctagon, tone: 'text-danger-600 bg-danger-50' },
};

export default function NotificationsPage() {
  const { refresh, decrement, clear } = useNotifications();

  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await notificationsApi.list({
        limit: 50,
        ...(onlyUnread ? { unread: 'true' } : {}),
      });
      setItems(response.data || []);
      setUnread(response.meta?.unread ?? 0);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [onlyUnread]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Marks one as read optimistically.
   *
   * The row updates before the request completes, because a notification the
   * user has visibly opened should not keep looking unread while a round trip
   * finishes. A failure is corrected by the reload.
   */
  const open = async (notification) => {
    if (notification.isRead) return;

    setItems((current) =>
      current.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n))
    );
    setUnread((n) => Math.max(0, n - 1));
    decrement();

    try {
      await notificationsApi.markRead(notification.id);
    } catch {
      await Promise.all([load(), refresh()]);
    }
  };

  const markAll = async () => {
    setClearing(true);
    try {
      await notificationsApi.markAllRead();
      setItems((current) => current.map((n) => ({ ...n, isRead: true })));
      setUnread(0);
      clear();
      if (onlyUnread) await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setClearing(false);
    }
  };

  if (loading) return <PageLoader label="Loading notifications..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={
          unread
            ? `${unread} unread notification${unread === 1 ? '' : 's'}`
            : 'You are all caught up.'
        }
        breadcrumbs={[{ label: 'Notifications' }]}
        actions={
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg bg-ink-100 p-0.5">
              {[
                { key: false, label: 'All' },
                { key: true, label: 'Unread' },
              ].map((tab) => (
                <button
                  key={String(tab.key)}
                  type="button"
                  onClick={() => setOnlyUnread(tab.key)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    onlyUnread === tab.key ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-600'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {unread > 0 && (
              <Button variant="secondary" size="sm" onClick={markAll} loading={clearing}>
                <CheckCheck className="h-4 w-4" />
                Mark all read
              </Button>
            )}
          </div>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon={onlyUnread ? BellOff : Bell}
          title={onlyUnread ? 'Nothing unread' : 'No notifications yet'}
          description={
            onlyUnread
              ? 'Everything here has been read.'
              : 'You will be told here when something needs your attention.'
          }
        />
      ) : (
        <Card className="divide-y divide-ink-200">
          {items.map((notification) => {
            const meta = SEVERITY[notification.severity] || SEVERITY.info;
            const Icon = meta.icon;

            const body = (
              <div
                className={`flex items-start gap-3 px-5 py-4 ${
                  notification.isRead ? '' : 'bg-brand-50/40'
                }`}
              >
                <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${meta.tone}`}>
                  <Icon size={17} aria-hidden="true" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p
                      className={`text-sm ${
                        notification.isRead ? 'text-ink-700' : 'font-semibold text-ink-900'
                      }`}
                    >
                      {notification.title}
                    </p>
                    <span className="shrink-0 text-xs whitespace-nowrap text-ink-400">
                      {formatRelative(notification.createdAt)}
                    </span>
                  </div>

                  {notification.body && (
                    <p className="mt-0.5 text-sm leading-relaxed text-ink-600">
                      {notification.body}
                    </p>
                  )}

                  {notification.actorName && (
                    <p className="mt-1 text-xs text-ink-400">by {notification.actorName}</p>
                  )}
                </div>

                {!notification.isRead && (
                  <span
                    className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-600"
                    aria-label="Unread"
                  />
                )}
              </div>
            );

            return notification.link ? (
              <Link
                key={notification.id}
                to={notification.link}
                onClick={() => open(notification)}
                className="block hover:bg-ink-50"
              >
                {body}
              </Link>
            ) : (
              <button
                key={notification.id}
                type="button"
                onClick={() => open(notification)}
                className="block w-full text-left hover:bg-ink-50"
              >
                {body}
              </button>
            );
          })}
        </Card>
      )}
    </>
  );
}
