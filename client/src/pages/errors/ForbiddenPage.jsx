import { Link } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { portalFor } from '../../utils/rbac.js';

export default function ForbiddenPage() {
  const { user } = useAuth();
  const home = user ? portalFor(user.role) : '/login';

  return (
    <div className="grid min-h-screen place-items-center bg-ink-100 px-6">
      <div className="max-w-md text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-danger-50 text-danger-600">
          <ShieldOff size={26} aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink-900">
          You do not have access to this page
        </h1>
        <p className="mt-2.5 text-sm leading-relaxed text-ink-500">
          Your account does not include the permissions required here. If you believe this is a
          mistake, ask your administrator to review your role.
        </p>
        <Link to={home} className="mt-7 inline-block">
          <Button size="lg">Back to my dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
