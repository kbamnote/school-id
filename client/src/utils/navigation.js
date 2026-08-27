import {
  LayoutDashboard,
  Building2,
  Printer,
  Layers,
  FileCheck2,
  Truck,
  CreditCard,
  BarChart3,
  ScrollText,
  Settings,
  Users,
  Tags,
  Network,
  Upload,
  FileText,
  PlusSquare,
  Share2,
  Inbox,
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
  Package,
  Bell,
  Palette,
  FileStack,
  UserCircle,
} from 'lucide-react';
import { PERMISSIONS as P } from './rbac.js';

/**
 * Sidebar definitions, one per portal.
 *
 * Each item may declare `permission` (or `anyPermission`). Items the signed-in
 * user cannot use are filtered out entirely rather than shown disabled - a
 * greyed-out menu of things you can never do is just noise.
 */

export const SUPER_ADMIN_NAV = [
  {
    section: null,
    items: [{ label: 'Dashboard', to: '/super-admin', icon: LayoutDashboard, end: true }],
  },
  {
    section: 'Clients',
    items: [
      { label: 'All Clients', to: '/super-admin/clients', icon: Building2, permission: P.CLIENT_VIEW },
      { label: 'Plans', to: '/super-admin/plans', icon: CreditCard, permission: P.PLAN_MANAGE },
    ],
  },
  {
    section: 'Production',
    items: [
      { label: 'Print Jobs', to: '/super-admin/jobs', icon: Printer, permission: P.JOBS_VIEW },
      { label: 'Printing Lots', to: '/super-admin/lots', icon: Layers, permission: P.LOTS_VIEW },
      { label: 'Proof Approvals', to: '/super-admin/proofs', icon: FileCheck2, permission: P.PROOFS_VIEW },
      { label: 'Dispatch', to: '/super-admin/dispatch', icon: Truck, permission: P.JOBS_MANAGE },
    ],
  },
  {
    section: 'Oversight',
    items: [
      { label: 'Reports', to: '/super-admin/reports', icon: BarChart3, permission: P.REPORTS_VIEW },
      { label: 'Audit Logs', to: '/super-admin/audit', icon: ScrollText, permission: P.AUDIT_VIEW },
      { label: 'Notifications', to: '/super-admin/notifications', icon: Bell, badgeKey: 'unreadNotifications' },
      { label: 'Settings', to: '/super-admin/settings', icon: Settings, permission: P.PLATFORM_MANAGE },
    ],
  },
];

export const CLIENT_NAV = [
  {
    section: null,
    items: [{ label: 'Dashboard', to: '/client', icon: LayoutDashboard, end: true }],
  },
  {
    section: 'People',
    items: [
      { label: 'All Users', to: '/client/users', icon: Users, permission: P.USERS_VIEW },
      { label: 'Categories', to: '/client/categories', icon: Tags, permission: P.CATEGORIES_MANAGE },
      { label: 'Departments', to: '/client/departments', icon: Network, permission: P.DEPARTMENTS_MANAGE },
      { label: 'Bulk Import', to: '/client/users/import', icon: Upload, permission: P.USERS_IMPORT },
    ],
  },
  {
    section: 'Digital Forms',
    items: [
      { label: 'All Forms', to: '/client/forms', icon: FileText, permission: P.FORMS_VIEW },
      { label: 'Create Form', to: '/client/forms/new', icon: PlusSquare, permission: P.FORMS_CREATE },
      { label: 'Assignments', to: '/client/forms/assignments', icon: Share2, permission: P.FORMS_ASSIGN },
      { label: 'Card Designs', to: '/client/card-designs', icon: Palette, permission: P.DESIGNS_VIEW },
    ],
  },
  {
    section: 'Submissions',
    items: [
      { label: 'All Submissions', to: '/client/submissions', icon: Inbox, permission: P.SUBMISSIONS_VIEW },
      {
        label: 'Pending Review',
        to: '/client/submissions/pending',
        icon: ClipboardCheck,
        permission: P.SUBMISSIONS_VIEW,
        badgeKey: 'pendingReview',
      },
      {
        label: 'Correction Required',
        to: '/client/submissions/corrections',
        icon: AlertTriangle,
        permission: P.SUBMISSIONS_VIEW,
        badgeKey: 'correctionRequired',
      },
      { label: 'Approved', to: '/client/submissions/approved', icon: CheckCircle2, permission: P.SUBMISSIONS_VIEW },
    ],
  },
  {
    section: 'Printing',
    items: [
      { label: 'Create Lot', to: '/client/lots/new', icon: PlusSquare, permission: P.LOTS_CREATE },
      { label: 'Data Lots', to: '/client/lots', icon: Layers, permission: P.LOTS_VIEW },
      { label: 'Print Jobs', to: '/client/jobs', icon: Package, permission: P.JOBS_VIEW },
      {
        label: 'Proofs',
        to: '/client/proofs',
        icon: FileStack,
        permission: P.PROOFS_VIEW,
        badgeKey: 'proofsAwaiting',
      },
    ],
  },
  {
    section: 'Organisation',
    items: [
      { label: 'Notifications', to: '/client/notifications', icon: Bell, badgeKey: 'unreadNotifications' },
      { label: 'Reports', to: '/client/reports', icon: BarChart3, permission: P.REPORTS_VIEW },
      { label: 'Audit Log', to: '/client/audit', icon: ScrollText, permission: P.AUDIT_VIEW },
      { label: 'Settings', to: '/client/settings', icon: Settings, permission: P.ORG_VIEW },
    ],
  },
];

export const PORTAL_NAV = [
  {
    section: null,
    items: [
      { label: 'My Forms', to: '/portal', icon: FileText, end: true },
      { label: 'My Submissions', to: '/portal/submissions', icon: Inbox },
      { label: 'Notifications', to: '/portal/notifications', icon: Bell, badgeKey: 'unreadNotifications' },
      { label: 'My Profile', to: '/portal/profile', icon: UserCircle },
    ],
  },
];

/** Drops items the user has no permission for, then drops sections left empty. */
export function filterNav(sections, user) {
  const held = user?.permissions || [];
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.permission) return held.includes(item.permission);
        if (item.anyPermission) return item.anyPermission.some((p) => held.includes(p));
        return true;
      }),
    }))
    .filter((section) => section.items.length > 0);
}
