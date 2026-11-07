import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      <p className="font-display text-6xl font-bold text-white/10">404</p>
      <h1 className="mt-2 font-display text-2xl font-bold text-white">This sector is uncharted</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        The page you followed does not exist, or it was moved during a NEXUS update.
      </p>
      <div className="mt-6 flex gap-2">
        <Link to="/" className="btn-primary text-sm">Back to home</Link>
        <Link to="/games" className="btn-ghost text-sm">Browse games</Link>
      </div>
    </div>
  );
}
