import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page-bg flex items-center justify-center px-6 py-16">
      <div className="card-elevated w-full max-w-md text-center" data-testid="not-found">
        <p className="eyebrow">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          This page doesn&apos;t exist
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          The link may be mistyped, or the page may have moved.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/dashboard" className="btn-primary">
            Go to dashboard
          </Link>
          <Link href="/" className="btn-secondary">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
