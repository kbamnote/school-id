import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute, { PublicOnlyRoute } from './ProtectedRoute.jsx';
import { PLATFORM_ROLES, CLIENT_ROLES, ROLES, PERMISSIONS, portalFor } from '../utils/rbac.js';
import { useAuth } from '../context/AuthContext.jsx';
import { FullScreenLoader, PageLoader } from '../components/ui/Spinner.jsx';

/* Auth screens stay in the main bundle - they are the first thing every
   visitor loads, so splitting them would only add a round trip. */
import LoginPage from '../pages/auth/LoginPage.jsx';
import ForgotPasswordPage from '../pages/auth/ForgotPasswordPage.jsx';
import ResetPasswordPage from '../pages/auth/ResetPasswordPage.jsx';
import ChangePasswordPage from '../pages/auth/ChangePasswordPage.jsx';
import ForbiddenPage from '../pages/errors/ForbiddenPage.jsx';
import NotFoundPage from '../pages/errors/NotFoundPage.jsx';

/**
 * Everything past sign-in is split by portal.
 *
 * The three audiences never overlap: a student on a phone has no use for the
 * form builder or the production dashboard, and should not pay to download
 * them. Splitting here keeps the initial payload proportional to the role.
 */
const SuperAdminLayout = lazy(() => import('../layouts/SuperAdminLayout.jsx'));
const ClientLayout = lazy(() => import('../layouts/ClientLayout.jsx'));
const PortalLayout = lazy(() => import('../layouts/PortalLayout.jsx'));

const SuperAdminDashboard = lazy(() => import('../pages/superAdmin/DashboardPage.jsx'));
const ClientsListPage = lazy(() => import('../pages/superAdmin/ClientsListPage.jsx'));
const ClientCreatePage = lazy(() => import('../pages/superAdmin/ClientCreatePage.jsx'));
const ClientDetailPage = lazy(() => import('../pages/superAdmin/ClientDetailPage.jsx'));
const ClientEditPage = lazy(() => import('../pages/superAdmin/ClientEditPage.jsx'));
const PlansPage = lazy(() => import('../pages/superAdmin/PlansPage.jsx'));
const JobsListPage = lazy(() => import('../pages/superAdmin/JobsListPage.jsx'));
const JobDetailPage = lazy(() => import('../pages/superAdmin/JobDetailPage.jsx'));
const PlatformReportsPage = lazy(() => import('../pages/superAdmin/ReportsPage.jsx'));

const ClientDashboard = lazy(() => import('../pages/client/DashboardPage.jsx'));
const CategoriesPage = lazy(() => import('../pages/client/CategoriesPage.jsx'));
const DepartmentsPage = lazy(() => import('../pages/client/DepartmentsPage.jsx'));
const UsersListPage = lazy(() => import('../pages/client/UsersListPage.jsx'));
const UserCreatePage = lazy(() => import('../pages/client/UserCreatePage.jsx'));
const UserDetailPage = lazy(() => import('../pages/client/UserDetailPage.jsx'));
const UserImportPage = lazy(() => import('../pages/client/UserImportPage.jsx'));
const FormsListPage = lazy(() => import('../pages/client/FormsListPage.jsx'));
const FormBuilderPage = lazy(() => import('../pages/client/FormBuilderPage.jsx'));
const FormDetailPage = lazy(() => import('../pages/client/FormDetailPage.jsx'));
const SubmissionsListPage = lazy(() => import('../pages/client/SubmissionsListPage.jsx'));
const SubmissionReviewPage = lazy(() => import('../pages/client/SubmissionReviewPage.jsx'));
const LotsListPage = lazy(() => import('../pages/client/LotsListPage.jsx'));
const LotCreatePage = lazy(() => import('../pages/client/LotCreatePage.jsx'));
const LotDetailPage = lazy(() => import('../pages/client/LotDetailPage.jsx'));
const ProofsListPage = lazy(() => import('../pages/client/ProofsListPage.jsx'));
const ProofReviewPage = lazy(() => import('../pages/client/ProofReviewPage.jsx'));
const ClientReportsPage = lazy(() => import('../pages/client/ReportsPage.jsx'));
const CardDesignsListPage = lazy(() => import('../pages/client/CardDesignsListPage.jsx'));
const CardDesignerPage = lazy(() => import('../pages/client/CardDesignerPage.jsx'));
const NotificationsPage = lazy(() => import('../pages/shared/NotificationsPage.jsx'));
const AuditLogPage = lazy(() => import('../pages/shared/AuditLogPage.jsx'));

const PortalHome = lazy(() => import('../pages/portal/HomePage.jsx'));
const FormFillPage = lazy(() => import('../pages/portal/FormFillPage.jsx'));
const MySubmissionsPage = lazy(() => import('../pages/portal/MySubmissionsPage.jsx'));

/** Sends an already-signed-in visitor to their own portal; otherwise to sign-in. */
function RootRedirect() {
  const { user, initialising } = useAuth();
  if (initialising) return <FullScreenLoader />;
  return <Navigate to={user ? portalFor(user.role) : '/login'} replace />;
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
      <Route path="/" element={<RootRedirect />} />

      {/* ---------------------------- public ---------------------------- */}
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Route>

      {/* Signed in, but not yet through the forced password change. */}
      <Route element={<ProtectedRoute />}>
        <Route path="/change-password" element={<ChangePasswordPage />} />
      </Route>

      {/* ------------------------ MR Print World ------------------------ */}
      <Route element={<ProtectedRoute roles={PLATFORM_ROLES} />}>
        <Route path="/super-admin" element={<SuperAdminLayout />}>
          <Route index element={<SuperAdminDashboard />} />

          <Route path="notifications" element={<NotificationsPage />} />
          <Route element={<ProtectedRoute permissions={[PERMISSIONS.AUDIT_VIEW]} />}>
            <Route path="audit" element={<AuditLogPage platform />} />
          </Route>

          {/* Client management. `new` is declared before `:id` so it is not
              swallowed by the dynamic segment. */}
          <Route element={<ProtectedRoute permissions={[PERMISSIONS.CLIENT_VIEW]} />}>
            <Route path="clients" element={<ClientsListPage />} />
          </Route>
          <Route element={<ProtectedRoute permissions={[PERMISSIONS.CLIENT_MANAGE]} />}>
            <Route path="clients/new" element={<ClientCreatePage />} />
            <Route path="clients/:id/edit" element={<ClientEditPage />} />
          </Route>
          <Route element={<ProtectedRoute permissions={[PERMISSIONS.CLIENT_VIEW]} />}>
            <Route path="clients/:id" element={<ClientDetailPage />} />
          </Route>

          <Route element={<ProtectedRoute permissions={[PERMISSIONS.PLAN_MANAGE]} />}>
            <Route path="plans" element={<PlansPage />} />
          </Route>

          {/* Production. Jobs are platform-wide, not tenant-scoped. */}
          <Route element={<ProtectedRoute permissions={[PERMISSIONS.JOBS_VIEW]} />}>
            <Route path="jobs" element={<JobsListPage />} />
            <Route path="jobs/:id" element={<JobDetailPage />} />
          </Route>

          <Route element={<ProtectedRoute permissions={[PERMISSIONS.REPORTS_VIEW]} />}>
            <Route path="reports" element={<PlatformReportsPage />} />
          </Route>
        </Route>
      </Route>

      {/* -------------------------- client org -------------------------- */}
      <Route element={<ProtectedRoute roles={CLIENT_ROLES} />}>
        <Route path="/client" element={<ClientLayout />}>
          <Route index element={<ClientDashboard />} />

          <Route element={<ProtectedRoute permissions={[PERMISSIONS.USERS_VIEW]} />}>
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="departments" element={<DepartmentsPage />} />
            <Route path="users" element={<UsersListPage />} />
          </Route>

          {/* Static segments before the dynamic :id, so they are not captured. */}
          <Route element={<ProtectedRoute permissions={[PERMISSIONS.USERS_CREATE]} />}>
            <Route path="users/new" element={<UserCreatePage />} />
          </Route>
          <Route element={<ProtectedRoute permissions={[PERMISSIONS.USERS_IMPORT]} />}>
            <Route path="users/import" element={<UserImportPage />} />
          </Route>
          <Route element={<ProtectedRoute permissions={[PERMISSIONS.USERS_VIEW]} />}>
            <Route path="users/:id" element={<UserDetailPage />} />
          </Route>

          {/* Forms. Static segments precede /:id so they are not captured. */}
          <Route element={<ProtectedRoute permissions={[PERMISSIONS.FORMS_CREATE]} />}>
            <Route path="forms/new" element={<FormBuilderPage />} />
          </Route>
          <Route element={<ProtectedRoute permissions={[PERMISSIONS.FORMS_EDIT]} />}>
            <Route path="forms/:id/edit" element={<FormBuilderPage />} />
          </Route>
          <Route element={<ProtectedRoute permissions={[PERMISSIONS.FORMS_VIEW]} />}>
            <Route path="forms" element={<FormsListPage />} />
            <Route path="forms/:id" element={<FormDetailPage />} />
          </Route>

          {/* Submissions. The literal "view" segment means a record id can
              never be mistaken for a status-group name. */}
          <Route element={<ProtectedRoute permissions={[PERMISSIONS.SUBMISSIONS_VIEW]} />}>
            <Route path="submissions" element={<SubmissionsListPage />} />
            <Route path="submissions/view/:id" element={<SubmissionReviewPage />} />
            <Route path="submissions/:group" element={<SubmissionsListPage />} />
          </Route>

          {/* Printing lots. The literal "new" precedes the dynamic :id. */}
          <Route element={<ProtectedRoute permissions={[PERMISSIONS.LOTS_CREATE]} />}>
            <Route path="lots/new" element={<LotCreatePage />} />
          </Route>
          <Route element={<ProtectedRoute permissions={[PERMISSIONS.LOTS_VIEW]} />}>
            <Route path="lots" element={<LotsListPage />} />
            <Route path="lots/:id" element={<LotDetailPage />} />
          </Route>

          <Route element={<ProtectedRoute permissions={[PERMISSIONS.PROOFS_VIEW]} />}>
            <Route path="proofs" element={<ProofsListPage />} />
            <Route path="proofs/:id" element={<ProofReviewPage />} />
          </Route>

          {/* Card designs. Editing needs DESIGNS_MANAGE; viewing only the layout
              needs DESIGNS_VIEW, so the list is reachable by both. */}
          <Route element={<ProtectedRoute permissions={[PERMISSIONS.DESIGNS_VIEW]} />}>
            <Route path="card-designs" element={<CardDesignsListPage />} />
            <Route path="card-designs/:id" element={<CardDesignerPage />} />
          </Route>

          {/* Notifications need no permission: they are scoped to the signed-in
              person, and every role has their own. */}
          <Route path="notifications" element={<NotificationsPage />} />

          <Route element={<ProtectedRoute permissions={[PERMISSIONS.AUDIT_VIEW]} />}>
            <Route path="audit" element={<AuditLogPage />} />
          </Route>

          <Route element={<ProtectedRoute permissions={[PERMISSIONS.REPORTS_VIEW]} />}>
            <Route path="reports" element={<ClientReportsPage />} />
          </Route>
        </Route>
      </Route>

      {/* --------------------------- end user --------------------------- */}
      <Route element={<ProtectedRoute roles={[ROLES.END_USER]} />}>
        <Route path="/portal" element={<PortalLayout />}>
          <Route index element={<PortalHome />} />
          <Route path="forms/:id" element={<FormFillPage />} />
          <Route path="submissions" element={<MySubmissionsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
        </Route>
      </Route>

      <Route path="/403" element={<ForbiddenPage />} />
      <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
