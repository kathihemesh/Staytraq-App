import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";
// Pure reminder-eligibility predicate, inlined so this edge function bundles
// without a cross-directory import (mirrors web/lib/identity/eligibility.ts,
// `request_flag && status != Verified && !ignore_flag`, Reqs 13.1-13.4).
function isReminderEligible(tenant: {
  identity_request_flag: boolean;
  verification_status: string;
  ignore_identity_flag: boolean;
}): boolean {
  return (
    tenant.identity_request_flag === true &&
    tenant.verification_status !== "Verified" &&
    tenant.ignore_identity_flag === false
  );
}

// Default verification-portal base path. Mirrors `buildVerificationLink` in the
// owner app (`app/src/lib/identity/token.ts`): the token is appended as a single
// path segment. Overridable via the IDENTITY_PORTAL_BASE env var.
const DEFAULT_PORTAL_BASE = "https://staytraq.vercel.app/identity-verify";

/**
 * Build the verification link by appending the token to the portal base path as
 * a single path segment. Kept consistent with the owner app's
 * `buildVerificationLink` (Req 13.5).
 */
function buildVerificationLink(base: string, token: string): string {
  const trimmed = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${trimmed}/${token}`;
}

/**
 * Build the identity-request reminder message. Always embeds the tenant name and
 * the verification link, kept consistent with the owner app's
 * `buildIdentityMessage` (`app/src/lib/identity/message.ts`) so reminders read
 * identically to the creation-time message (Reqs 13.5).
 */
function buildIdentityMessage(name: string, link: string): string {
  const tenantName = (name ?? "").trim() || "Tenant";
  return (
    `Hi ${tenantName},\n\n` +
    `Your property owner has requested that you verify your identity on Staytraq.\n\n` +
    `Please open the secure link below to upload your identity document. ` +
    `Your documents are encrypted and visible only to your property owner:\n${link}\n\n` +
    `Thank you!`
  );
}

/** Local calendar date as YYYY-MM-DD, matching the `date` column semantics. */
function toCalendarDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const chatbotApiUrl = Deno.env.get("CHATBOT_API_URL") ?? "";
  const serviceKey = Deno.env.get("INTERNAL_SERVICE_KEY") ?? "";
  const portalBase = Deno.env.get("IDENTITY_PORTAL_BASE") ?? DEFAULT_PORTAL_BASE;

  if (!chatbotApiUrl || !serviceKey) {
    console.error(
      "identity-reminders is misconfigured: CHATBOT_API_URL and/or INTERNAL_SERVICE_KEY are not set."
    );
    return new Response(
      JSON.stringify({ success: false, error: "missing_configuration" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const today = toCalendarDate(new Date());

  // Select tenants where an identity request was made, verification is still
  // incomplete, and reminders have not been silenced (Reqs 13.1-13.4). The
  // matching pure predicate is re-applied per row as the single source of truth.
  // The once-per-calendar-day guard uses identity_reminder_last_date: rows whose
  // last reminder date is already today are excluded so no tenant is messaged
  // more than once per calendar day, even across multiple invocations (Req 13.1).
  const { data: tenants, error } = await supabase
    .from("tenants_table")
    .select(`
      id,
      name,
      owner_id,
      mobile_number,
      verification_token,
      verification_status,
      identity_request_flag,
      ignore_identity_flag,
      identity_reminder_last_date
    `)
    .eq("identity_request_flag", true)
    .neq("verification_status", "Verified")
    .eq("ignore_identity_flag", false)
    .or(`identity_reminder_last_date.is.null,identity_reminder_last_date.neq.${today}`);

  if (error) {
    console.error("Error fetching tenants for identity reminders:", error);
    return new Response(JSON.stringify(error), { status: 500 });
  }

  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const tenant of tenants || []) {
    // Re-apply the pure eligibility rule as the authoritative check (Reqs 13.1-13.4).
    if (!isReminderEligible(tenant)) {
      skippedCount++;
      continue;
    }

    // Defensive double-check of the once-per-day guard in case the query filter
    // and the stored value diverge (Req 13.1).
    if (tenant.identity_reminder_last_date === today) {
      skippedCount++;
      continue;
    }

    // Record that this tenant was processed today so a re-invocation within the
    // same calendar day does not message them again (Req 13.1). Set regardless of
    // outcome; the tenant stays eligible for the next calendar day because the
    // request flag and status are unchanged (Req 13.6).
    const markProcessedToday = async () => {
      const { error: stampErr } = await supabase
        .from("tenants_table")
        .update({ identity_reminder_last_date: today })
        .eq("id", tenant.id);
      if (stampErr) {
        console.error(
          `Failed to stamp identity_reminder_last_date for tenant ${tenant.name} (${tenant.id}):`,
          stampErr
        );
      }
    };

    const recordDeliveryFailure = async () => {
      const { error: failErr } = await supabase
        .from("tenants_table")
        .update({ identity_msg_failed: true })
        .eq("id", tenant.id);
      if (failErr) {
        console.error(
          `Failed to record delivery failure for tenant ${tenant.name} (${tenant.id}):`,
          failErr
        );
      }
    };

    // No recorded mobile number → do not send, record a delivery failure, keep
    // the tenant eligible for next day (Req 13.7). The backend also resolves the
    // mobile, but pre-checking here avoids a pointless round-trip.
    if (!tenant.mobile_number) {
      await recordDeliveryFailure();
      await markProcessedToday();
      failedCount++;
      continue;
    }

    // A tenant with the request flag but no persisted verification token cannot
    // receive a valid link, so no message can be built (Req 13.5). Record a
    // delivery failure and move on; the tenant remains eligible next day.
    if (!tenant.verification_token) {
      console.error(
        `Tenant ${tenant.name} (${tenant.id}) is reminder-eligible but has no verification_token; recording failure.`
      );
      await recordDeliveryFailure();
      await markProcessedToday();
      failedCount++;
      continue;
    }

    const link = buildVerificationLink(portalBase, tenant.verification_token);
    const message = buildIdentityMessage(tenant.name ?? "", link);

    // Deliver via the chatbot backend's service-authenticated endpoint. The
    // scheduler has no per-owner JWT, so it authenticates with the static
    // INTERNAL_SERVICE_KEY and passes the owner/tenant identity for server-side
    // resolution (matches the SendNoticeServiceRequest contract) (Reqs 13.1, 13.5).
    let ok = false;
    try {
      const response = await fetch(`${chatbotApiUrl}/api/v1/send-whatsapp-notice-service`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
          "bypass-tunnel-reminder": "true",
        },
        body: JSON.stringify({
          owner_id: String(tenant.owner_id),
          tenant_id: tenant.id,
          message,
        }),
      });
      ok = response.ok;
      if (!ok) {
        console.error(
          `Reminder delivery returned non-success (${response.status}) for tenant ${tenant.name} (${tenant.id}).`
        );
      }
    } catch (err) {
      console.error(
        `Reminder delivery threw for tenant ${tenant.name} (${tenant.id}):`,
        err
      );
      ok = false;
    }

    if (ok) {
      console.log(`Identity reminder sent for tenant ${tenant.name} (${tenant.id}).`);
      sentCount++;
    } else {
      // Non-success response → record a delivery failure; the tenant stays
      // eligible for the next calendar day's reminder (Req 13.6).
      await recordDeliveryFailure();
      failedCount++;
    }

    // Exactly one attempt per calendar day regardless of outcome (Req 13.1).
    await markProcessedToday();
  }

  return new Response(
    JSON.stringify({
      success: true,
      sentCount,
      failedCount,
      skippedCount,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
});
