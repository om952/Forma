/**
 * A shared demo workspace (see backend/src/scripts/seedDemo.ts), offered on the
 * home and sign-in pages when both variables are set at build time. Leave
 * them unset on any deployment with real users: the password is public.
 */
const email = process.env.NEXT_PUBLIC_DEMO_EMAIL;
const password = process.env.NEXT_PUBLIC_DEMO_PASSWORD;

export const demoAccount = email && password ? { email, password } : null;
