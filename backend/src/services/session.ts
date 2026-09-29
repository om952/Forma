import * as jwt from "jsonwebtoken";

import { env } from "../config/env";

/** What a session token carries. `tv` is the user's `tokenVersion` at issue. */
export type SessionClaims = {
  userId: string;
  orgId: string;
  role: string;
  tv?: number;
};

type SessionSubject = {
  id: string;
  orgId: string;
  role: string;
  tokenVersion: number;
};

// `JWT_SECRET` is guaranteed present and non-placeholder by config validation
// at boot, so there is nothing left to check here.
export const signSessionToken = (user: SessionSubject): string =>
  jwt.sign(
    { userId: user.id, orgId: user.orgId, role: user.role, tv: user.tokenVersion },
    env.JWT_SECRET,
    { expiresIn: "7d", algorithm: "HS256" }
  );

/** Throws if the token is malformed, expired or not signed by us. */
export const verifySessionToken = (token: string): SessionClaims =>
  jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as SessionClaims;

type PublicUserSource = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  orgId: string;
  emailVerifiedAt: Date | null;
};

/** The user as every auth endpoint returns it. */
export const toPublicUser = (user: PublicUserSource) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  orgId: user.orgId,
  emailVerified: user.emailVerifiedAt !== null,
});
