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

    // Check two candidate months: current month and next month (handles early-month due dates correctly)
    const candidateMonths = [
      { y: today.getFullYear(), m: today.getMonth() },
      { y: today.getFullYear(), m: today.getMonth() + 1 }
    ];

    let targetDueDate = null;
    let matchFound = false;

    for (const cand of candidateMonths) {
      const candDate = new Date(cand.y, cand.m, dueDay);
      const candDateOnly = new Date(candDate.getFullYear(), candDate.getMonth(), candDate.getDate());
      
      const diffTime = candDateOnly.getTime() - todayDate.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      // Generate payment 10 days before due date or if within/past due date
      if (diffDays <= 10) {
        targetDueDate = candDateOnly;
        matchFound = true;
        break;
      }
    }

    if (matchFound && targetDueDate) {
      const month = targetDueDate.getMonth() + 1; // 1-indexed
      const year = targetDueDate.getFullYear();

      // Prevent duplicates using maybeSingle() instead of single() to avoid PGRST116 error
      const { data: existing, error: existErr } = await supabase
        .from("payments")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("month", month)
        .eq("year", year)
        .maybeSingle();

      if (existErr) {
        console.error(`Error checking existing payment for ${tenant.name}:`, existErr);
        continue;
      }

      if (!existing) {
        const rentAmount = tenant.rooms_table?.rent_amount || 0;
        const extraCharges = tenant.extra_charges || 0;
        const totalAmount = rentAmount + extraCharges;

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
            due_date: targetDueDate.toISOString().split("T")[0],
            status: "pending"
          })
          .select("id")
          .maybeSingle();

        if (insertErr) {
          console.error(`Failed to generate payment for ${tenant.name}:`, insertErr);
        } else {
          console.log(`Payment successfully generated for ${tenant.name}`);
          generatedCount++;

          // Log audit trail entry
          if (inserted?.id) {
            const { error: auditErr } = await supabase
              .from("payment_audit_log")
              .insert({
                payment_id: inserted.id,
                owner_id: tenant.owner_id,
                action: "generated",
                notes: `Auto-generated for ${tenant.name} — due ${targetDueDate.toISOString().split("T")[0]}`,
              });

            if (auditErr) {
              console.error(`Audit log failed for payment ${inserted.id}:`, auditErr);
            }
          }
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