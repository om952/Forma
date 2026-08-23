"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { clearAuthToken, getAuthUser, type AuthUser } from "../lib/auth";

/**
 * Persistent top bar for every authenticated page. Rendered per-page rather
 * than via a shared layout — see the UI-overhaul plan for why: moving pages
 * into a route group would mean rewriting every relative import for a purely
 * cosmetic change.
 */
export default function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(getAuthUser());
  }, []);

  const handleSignOut = () => {
    clearAuthToken();
    router.push("/auth");
  };

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname?.startsWith(href));

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              F
            </span>
            <span className="text-lg font-semibold tracking-tight text-slate-900">
              Forma
            </span>
          </Link>

          <nav className="hidden items-center gap-1 sm:flex">
            <Link
              href="/dashboard"
              className={isActive("/dashboard") ? "nav-link-active" : "nav-link"}
            >
              Dashboard
            </Link>
            <Link
              href="/billing"
              className={isActive("/billing") ? "nav-link-active" : "nav-link"}
            >
              Billing
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <span className="hidden text-sm text-slate-500 sm:inline">
              {user.email}
            </span>
          ) : null}
          <button onClick={handleSignOut} className="btn-secondary py-2 text-xs">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
