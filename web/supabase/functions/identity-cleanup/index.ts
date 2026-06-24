import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";
// Pure cleanup-eligibility predicate, inlined so this edge function bundles
// without a cross-directory import (mirrors web/lib/identity/eligibility.ts,
// exit date recorded and now >= exit_date + 15 days, Reqs 19.1-19.3).
const CLEANUP_DELAY_DAYS = 15;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toTimestamp(value: Date | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isCleanupEligible(
  exitDate: Date | string | null | undefined,
  now: Date | string | null | undefined
): boolean {
  const exitMs = toTimestamp(exitDate);
  if (exitMs === null) return false;
  const nowMs = toTimestamp(now);
  if (nowMs === null) return false;
  return nowMs >= exitMs + CLEANUP_DELAY_DAYS * MS_PER_DAY;
}

const IDENTITY_BUCKET = "identity_documents";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const now = new Date();

  // Select tenants that have a recorded move-out date, still hold identity data,
  // and have not already had a successful cleanup recorded. Tenants with no
  // exit_date are never selected (Req 19.3); rows left over from a failed prior
  // run keep identity_deleted_at NULL and are naturally re-selected here, which
  // is the once-per-day retry (Req 19.5).
  const { data: tenants, error } = await supabase
    .from("tenants_table")
    .select(`
      id,
      name,
      owner_id,
      exit_date,
      id_front_path,
      id_back_path,
      aadhaar_number,
      pan_code,
      identity_deleted_at
    `)
    .not("exit_date", "is", null)
    .is("identity_deleted_at", null)
    .or(
      "id_front_path.not.is.null,id_back_path.not.is.null,aadhaar_number.not.is.null,pan_code.not.is.null"
    );

  if (error) {
    console.error("Error fetching tenants for identity cleanup:", error);
    return new Response(JSON.stringify(error), { status: 500 });
  }

  let cleanedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const tenant of tenants || []) {
    // Eligible only once now is on/after exit_date + 15 calendar days (Reqs 19.1, 19.2).
    // No exit date is never eligible (Req 19.3) — the pure predicate enforces this too.
    if (!isCleanupEligible(tenant.exit_date, now)) {
      skippedCount++;
      continue;
    }

    try {
      // 1) Delete stored document images from the private identity_documents
      //    bucket. Paths follow {owner_id}/{tenant_id}/{front|back}.{ext} and are
      //    stored on the tenant record (Req 19.1).
      const paths = [tenant.id_front_path, tenant.id_back_path].filter(
        (p): p is string => typeof p === "string" && p.length > 0
      );

      if (paths.length > 0) {
        const { error: removeErr } = await supabase.storage
          .from(IDENTITY_BUCKET)
          .remove(paths);

        if (removeErr) {
          // Retain affected data; do not clear values or set identity_deleted_at.
          // The tenant remains selectable for the next daily run (Req 19.5).
          throw new Error(`storage removal failed: ${removeErr.message}`);
        }
      }

      // 2) Clear stored identity values and document references, and record the
      //    deletion-confirmation timestamp — all in one update so a tenant is
      //    only marked deleted when both image removal and value clearing succeed
      //    (Reqs 19.2, 19.4).
      const { error: updateErr } = await supabase
        .from("tenants_table")
        .update({
          aadhaar_number: null,
          pan_code: null,
          id_front_path: null,
          id_back_path: null,
          identity_deleted_at: now.toISOString(),
        })
        .eq("id", tenant.id);

      if (updateErr) {
        throw new Error(`value clearing failed: ${updateErr.message}`);
      }

      console.log(`Identity data cleaned up for tenant ${tenant.name} (${tenant.id})`);
      cleanedCount++;
    } catch (err) {
      // Record an error identifying the failed deletion and retain the data; the
      // tenant is retried on the next daily run since identity_deleted_at stays
      // NULL (Req 19.5).
      console.error(`Identity cleanup failed for tenant ${tenant.name} (${tenant.id}):`, err);
      failedCount++;
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      cleanedCount,
      failedCount,
      skippedCount,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
});
