/**
 * Shown in place of a page's content when loading it failed, so the page
 * doesn't fall through to its empty state ("No forms yet") and mislead.
 */
export default function LoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="card-elevated p-10 text-center" data-testid="load-error" role="alert">
      <p className="font-semibold text-slate-900">Couldn&apos;t load this page</p>
      <p className="mt-2 text-sm text-slate-600">{message}</p>
      {onRetry ? (
        <button type="button" className="btn-secondary mt-5" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
