import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronDown, LogOut, Menu, Printer, KeyRound, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { filterNav } from '../utils/navigation.js';
import { ROLE_LABELS } from '../utils/rbac.js';

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function NavItem({ item, badges, onNavigate }) {
  const count = item.badgeKey ? badges?.[item.badgeKey] : 0;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        clsx(
          'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition',
          isActive
            ? 'bg-brand-50 text-brand-700'
            : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
        )
      }
    >
      {({ isActive }) => (
        <>
          <item.icon
            size={17}
            className={clsx('shrink-0', isActive ? 'text-brand-600' : 'text-ink-400 group-hover:text-ink-600')}
            aria-hidden="true"
          />
          <span className="flex-1 truncate">{item.label}</span>
          {count > 0 && (
            <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-white tabular">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click and on Escape - both are expected of a menu.
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-lg py-1.5 pr-2 pl-1.5 transition hover:bg-ink-100"
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="size-8 rounded-full object-cover" />
        ) : (
          <span className="grid size-8 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white">
            {initials(user.name)}
          </span>
        )}
        <span className="hidden text-left sm:block">
          <span className="block max-w-[10rem] truncate text-sm font-medium text-ink-900">
            {user.name}
          </span>
          <span className="block text-[0.6875rem] text-ink-500">
            {ROLE_LABELS[user.role] || user.role}
          </span>
        </span>
        <ChevronDown size={15} className="text-ink-400" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1.5 w-60 animate-fade-in overflow-hidden rounded-card border border-ink-200 bg-white shadow-float"
        >
          <div className="border-b border-ink-200 px-3.5 py-3">
            <p className="truncate text-sm font-medium text-ink-900">{user.name}</p>
            <p className="truncate text-xs text-ink-500">{user.email || user.loginId}</p>
            {user.organization && (
              <p className="mt-1.5 truncate text-xs font-medium text-brand-600">
                {user.organization.name}
              </p>
            )}
          </div>
          <div className="p-1.5">
            <Link
              to="/change-password"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink-600 transition hover:bg-ink-100 hover:text-ink-900"
            >
              <KeyRound size={15} aria-hidden="true" /> Change password
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={onLogout}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-danger-600 transition hover:bg-danger-50"
            >
              <LogOut size={15} aria-hidden="true" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Shared application shell for all three portals.
 *
 * The sidebar is a permanent column from `lg` up and a slide-over drawer below
 * it, so the same nav works on an operator's desktop and a student's phone.
 */
export default function AppShell({ nav, portalName, portalHome, badges = {}, accent = 'brand' }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Any navigation closes the mobile drawer.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const sections = filterNav(nav, user);

  const brand = (
    <Link to={portalHome} className="flex items-center gap-2.5 px-1">
      <span
        className={clsx(
          'grid size-9 shrink-0 place-items-center rounded-lg text-white shadow-panel',
          accent === 'accent' ? 'bg-accent-500' : 'bg-brand-600'
        )}
      >
        <Printer size={18} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold tracking-tight text-ink-900">
          MR Print World
        </span>
        <span className="block truncate text-[0.6875rem] text-ink-500">{portalName}</span>
      </span>
    </Link>
  );

  const navList = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Main">
      {sections.map((section, i) => (
        <div key={section.section || `s-${i}`}>
          {section.section && (
            <p className="mb-1.5 px-2.5 text-[0.6875rem] font-semibold tracking-wider text-ink-400 uppercase">
              {section.section}
            </p>
          )}
          <div className="space-y-0.5">
            {section.items.map((item) => (
              <NavItem key={item.to} item={item} badges={badges} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-ink-100">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-ink-200 bg-white lg:flex">
        <div className="flex h-16 items-center border-b border-ink-200 px-4">{brand}</div>
        {navList}
        <div className="border-t border-ink-200 px-4 py-3">
          <p className="text-[0.6875rem] text-ink-400">
            &copy; {new Date().getFullYear()} MR Print World Pvt. Ltd.
          </p>
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-ink-900/40"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 animate-slide-up flex-col bg-white shadow-float">
            <div className="flex h-16 items-center justify-between border-b border-ink-200 px-4">
              {brand}
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-md p-1.5 text-ink-500 transition hover:bg-ink-100"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>
            {navList}
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-ink-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="rounded-lg p-2 text-ink-600 transition hover:bg-ink-100 lg:hidden"
            aria-label="Open menu"
          >
            <Menu size={19} />
          </button>

          {user?.organization && (
            <div className="hidden min-w-0 items-center gap-2 sm:flex">
              {user.organization.logoUrl ? (
                <img
                  src={user.organization.logoUrl}
                  alt=""
                  className="size-7 rounded-md object-cover ring-1 ring-ink-200"
                />
              ) : null}
              <span className="truncate text-sm font-medium text-ink-700">
                {user.organization.name}
              </span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            {user && <UserMenu user={user} onLogout={logout} />}
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
