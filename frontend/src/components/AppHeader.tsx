"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiError, apiJson, errorMessage } from "../lib/api";
import {
  clearAuthToken,
  setAuthUser,
  useAuthToken,
  useAuthUser,
  type AuthUser,
} from "../lib/auth";

/**
 * Persistent top bar for every authenticated page. Rendered per-page rather
 * than via a shared layout — see the UI-overhaul plan for why: moving pages
 * into a route group would mean rewriting every relative import for a purely
 * cosmetic change.
 */
const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/team", label: "Team" },
  { href: "/billing", label: "Billing" },
];

export default function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const token = useAuthToken();
  const user = useAuthUser();
  const [resendNote, setResendNote] = useState<string | null>(null);

  // The stored user is a snapshot from sign-in. Refreshing it on each page
  // picks up role changes and email confirmation, and signs this tab out if the
  // session was revoked (password changed, removed from the org, signed out
  // everywhere).
  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    apiJson<{ user: AuthUser }>("/api/auth/me", { token })
      .then((me) => {
        if (!cancelled) setAuthUser(me.user);
      })
      .catch((error) => {
        if (!cancelled && error instanceof ApiError && error.status === 401) {
          clearAuthToken();
          router.push("/auth");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, router]);

  const handleSignOut = () => {
    clearAuthToken();
    router.push("/auth");
  };

  const resendVerification = async () => {
    try {
      const data = await apiJson<{ message: string }>("/api/auth/resend-verification", {
        token,
        method: "POST",
      });
      setResendNote(data.message);
    } catch (error) {
      setResendNote(errorMessage(error));
    }
  };

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname?.startsWith(href));

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
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
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={isActive(item.href) ? "nav-link-active" : "nav-link"}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <Link
                href="/account"
                className="hidden text-sm text-slate-500 hover:text-slate-900 sm:inline"
                title="Account settings"
              >
                {user.email}
              </Link>
            ) : null}
            <button onClick={handleSignOut} className="btn-secondary py-2 text-xs">
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Phones: the links get their own row instead of disappearing. */}
      <nav
        className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 sm:hidden"
        aria-label="Main"
      >
        {[...NAV, { href: "/account", label: "Account" }].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`shrink-0 ${isActive(item.href) ? "nav-link-active" : "nav-link"}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {user?.emailVerified === false ? (
        <div className="border-b border-amber-200 bg-amber-50" data-testid="verify-banner">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-2 text-sm text-amber-800">
            <span>
              {resendNote ??
                `Confirm your email address (${user.email}) using the link we sent you.`}
            </span>
            {resendNote ? null : (
              <button
                type="button"
                className="font-semibold underline"
                onClick={resendVerification}
              >
                Resend link
              </button>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
