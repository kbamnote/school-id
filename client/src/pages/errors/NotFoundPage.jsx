import { Link } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { portalFor } from '../../utils/rbac.js';

export default function NotFoundPage() {
  const { user } = useAuth();
  const home = user ? portalFor(user.role) : '/login';

  return (
    <div className="grid min-h-screen place-items-center bg-ink-100 px-6">
      <div className="max-w-md text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-ink-200 text-ink-500">
          <FileQuestion size={26} aria-hidden="true" />
        </span>
        <p className="mt-6 text-xs font-semibold tracking-wider text-ink-400 uppercase">
          Error 404
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">
          We could not find that page
        </h1>
        <p className="mt-2.5 text-sm leading-relaxed text-ink-500">
          The link may be outdated, or the page may have been moved.
        </p>
        <Link to={home} className="mt-7 inline-block">
          <Button size="lg">Back to my dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
