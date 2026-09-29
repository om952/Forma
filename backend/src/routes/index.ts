import type { Mount } from "../openapi/document";
import { analyticsRoutes } from "./analytics.routes";
import { authRoutes } from "./auth.routes";
import { filesRoutes } from "./files.routes";
import { formRoutes } from "./form.routes";
import { healthRoutes } from "./health.routes";
import { inviteRoutes } from "./invite.routes";
import { orgRoutes } from "./org.routes";
import { paymentRoutes } from "./payment.routes";
import { responseRoutes } from "./response.routes";
import { uploadRoutes } from "./upload.routes";
import { webhookRoutes } from "./webhook.routes";

/** Every route and where it is mounted: what the server serves and the API reference describes. */
export const mounts: Mount[] = [
  { prefix: "/health", tag: "Health", tagDescription: "Liveness and readiness probes.", routes: healthRoutes },
  { prefix: "/api/auth", tag: "Auth", tagDescription: "Sign-up, sessions, password reset and email confirmation.", routes: authRoutes },
  { prefix: "/api/org", tag: "Team", tagDescription: "Members, roles and invitations of the caller's organization.", routes: orgRoutes },
  { prefix: "/api/invites", tag: "Invitations", tagDescription: "The invitee's side of an invitation.", routes: inviteRoutes },
  { prefix: "/api/forms", tag: "Forms", tagDescription: "Building forms, and the public form page with its visit tracking.", routes: formRoutes },
  { prefix: "/api/responses", tag: "Responses", tagDescription: "Submitting, listing and exporting responses.", routes: responseRoutes },
  { prefix: "/api/uploads", tag: "Files", tagDescription: "Files attached to responses.", routes: uploadRoutes },
  { prefix: "/api/files", tag: "Files", routes: filesRoutes },
  { prefix: "/api/analytics", tag: "Analytics", tagDescription: "Funnel, drop-off and submission patterns (Premium).", routes: analyticsRoutes },
  { prefix: "/api/webhooks", tag: "Webhooks", tagDescription: "Delivering responses to other systems, with retries and a dead-letter queue.", routes: webhookRoutes },
  { prefix: "/api/payments", tag: "Billing", tagDescription: "Premium subscriptions through Razorpay.", routes: paymentRoutes },
];
