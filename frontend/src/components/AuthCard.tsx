import Link from "next/link";
import type { ReactNode } from "react";

/** Centered card for the signed-out account pages: invites, resets, verification. */
export default function AuthCard({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col justify-center bg-slate-50 px-6 py-12">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        <Link href="/" className="mb-2 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            F
          </span>
          <span className="text-lg font-semibold text-slate-900">Forma</span>
        </Link>

        <header>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 text-sm text-slate-600">{description}</p>
          ) : null}
        </header>

        <div className="card-elevated space-y-5">{children}</div>
      </div>
    </div>
  );
}
