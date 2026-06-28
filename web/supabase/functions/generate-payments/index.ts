import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Get active tenants with room details for rent calculation
  const { data: tenants, error } = await supabase
    .from("tenants_table")
    .select(`
      id,
      name,
      owner_id,
      rent_due_day,
      extra_charges,
      join_date,
      rooms_table (
        rent_amount
      )
    `)
    .eq("status", "active");

  if (error) {
    console.error("Error fetching tenants:", error);
    return new Response(JSON.stringify(error), { status: 500 });
  }

  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let generatedCount = 0;

  // Update existing pending payments to 'late' if today is past their due_date
  const todayStr = todayDate.toISOString().split("T")[0];
  const { error: lateErr } = await supabase
    .from("payments")
    .update({ status: "late" })
    .eq("status", "pending")
    .lt("due_date", todayStr);

  if (lateErr) {
    console.error("Error updating late payments:", lateErr);
  } else {
    console.log("Successfully marked overdue payments as late");
  }

  for (const tenant of tenants || []) {
    const dueDay = tenant.rent_due_day;
    if (!dueDay) continue;

    // Don't bill months before the tenant joined.
    const joinDate = tenant.join_date ? new Date(tenant.join_date) : null;
    const joinMonthStart = joinDate && !isNaN(joinDate.getTime())
      ? new Date(joinDate.getFullYear(), joinDate.getMonth(), 1)
      : null;

    // Consider the current and next month. Unlike before, we DON'T stop at the
    // first match: an overdue current-month record AND a near-future next-month
    // record can both be generated in one run.
    const candidateMonths = [
      { y: today.getFullYear(), m: today.getMonth() },
      { y: today.getFullYear(), m: today.getMonth() + 1 }
    ];

    for (const cand of candidateMonths) {
      // Clamp the due day to the last valid day of the candidate month so that
      // tenants with a due day of 29/30/31 are billed end-of-month in short
      // months (e.g. Feb 28/29) instead of JavaScript silently rolling the date
      // into the following month.
      const daysInMonth = new Date(cand.y, cand.m + 1, 0).getDate();
      const clampedDay = Math.min(dueDay, daysInMonth);
      const candDate = new Date(cand.y, cand.m, clampedDay);
      const candDateOnly = new Date(candDate.getFullYear(), candDate.getMonth(), candDate.getDate());

      const diffTime = candDateOnly.getTime() - todayDate.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      // Generate overdue (current-month) records and anything due within 10 days.
      if (diffDays > 10) continue;

      // Skip months before the tenant joined.
      const candMonthStart = new Date(candDateOnly.getFullYear(), candDateOnly.getMonth(), 1);
      if (joinMonthStart && candMonthStart < joinMonthStart) continue;

      const month = candDateOnly.getMonth() + 1; // 1-indexed
      const year = candDateOnly.getFullYear();

      // Prevent duplicate rent records (ignore deposit records for this month).
      const { data: existing, error: existErr } = await supabase
        .from("payments")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("month", month)
        .eq("year", year)
        .eq("is_deposit", false)
        .maybeSingle();

      if (existErr) {
        console.error(`Error checking existing payment for ${tenant.name}:`, existErr);
        continue;
      }
      if (existing) continue;

      const rentAmount = tenant.rooms_table?.rent_amount || 0;
      const extraCharges = tenant.extra_charges || 0;
      const totalAmount = rentAmount + extraCharges;
      // A record whose due date has already passed is created as 'late'.
      const status = candDateOnly.getTime() < todayDate.getTime() ? "late" : "pending";
      const dueDateStr = candDateOnly.toISOString().split("T")[0];

      const { data: inserted, error: insertErr } = await supabase
        .from("payments")
        .insert({
          tenant_id: tenant.id,
          owner_id: tenant.owner_id,
          month,
          year,
          rent_amount: rentAmount,
          extra_charges: extraCharges,
          total_amount: totalAmount,
          due_date: dueDateStr,
          status,
          is_deposit: false
        })
        .select("id")
        .maybeSingle();

      if (insertErr) {
        console.error(`Failed to generate payment for ${tenant.name}:`, insertErr);
        continue;
      }

      console.log(`Payment (${status}) generated for ${tenant.name} — ${month}/${year}`);
      generatedCount++;

      if (inserted?.id) {
        const { error: auditErr } = await supabase
          .from("payment_audit_log")
          .insert({
            payment_id: inserted.id,
            owner_id: tenant.owner_id,
            action: "generated",
            notes: `Auto-generated for ${tenant.name} — due ${dueDateStr} (${status})`,
          });
        if (auditErr) {
          console.error(`Audit log failed for payment ${inserted.id}:`, auditErr);
        }
      }
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      generatedCount
    }),
    { 
      status: 200,
      headers: { "Content-Type": "application/json" }
    }
  );
});