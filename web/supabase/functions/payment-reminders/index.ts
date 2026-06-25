import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

// Daily payment-reminder scheduler.
//
// For every tenant with at least one unpaid bill (status not "paid"/"submitted")
// that is within the reminder window — due within the next 2 days, due today, or
// overdue — this sends ONE combined WhatsApp reminder per calendar day listing
// all such bills with their per-bill status (upcoming / due today / late by N).
// Each tenant gets a unique payment link (a per-tenant payment-portal token) that
// skips mobile verification and shows their dues directly.
//
// Pure timing/wording logic mirrors web/lib/payments/reminders.ts (inlined here
// because edge functions cannot bundle a cross-directory import). A 3.5s delay is
// inserted between sends so WhatsApp does not flag the sender.

const REMINDER_LEAD_DAYS = 2;
const SEND_DELAY_MS = 3500;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DEFAULT_PORTAL_BASE = "https://staytraq.vercel.app/pay";

const TOKEN_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const TOKEN_LENGTH = 22;
const UNIQUE_VIOLATION = "23505";

type DueKind = "upcoming" | "due_today" | "late";

interface DueBill {
  amount: number;
  month: number;
  year: number;
  dueDate: string;
  status: string | null;
}

interface ReminderBillView {
  amount: number;
  monthName: string;
  year: number;
  kind: DueKind;
  days: number;
  label: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toCalendarMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

function toCalendarDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysUntilDue(dueDate: string, today: string): number | null {
  const dueMs = toCalendarMs(dueDate);
  const todayMs = toCalendarMs(today);
  if (dueMs === null || todayMs === null) return null;
  return Math.round((dueMs - todayMs) / MS_PER_DAY);
}

function needsPaymentReminder(status: string | null | undefined): boolean {
  const s = (status ?? "").trim().toLowerCase();
  return s !== "paid" && s !== "submitted";
}

function classifyDue(dueDate: string, today: string): { kind: DueKind; days: number } | null {
  const delta = daysUntilDue(dueDate, today);
  if (delta === null) return null;
  if (delta > 0) return { kind: "upcoming", days: delta };
  if (delta === 0) return { kind: "due_today", days: 0 };
  return { kind: "late", days: -delta };
}

function isWithinReminderWindow(dueDate: string, today: string, leadDays: number): boolean {
  const delta = daysUntilDue(dueDate, today);
  if (delta === null) return false;
  return delta <= leadDays;
}

function billLabel(kind: DueKind, days: number): string {
  if (kind === "due_today") return "due today";
  if (kind === "upcoming") return days === 1 ? "due tomorrow" : `due in ${days} days`;
  return days === 1 ? "late by 1 day" : `late by ${days} days`;
}

function urgencyRank(view: ReminderBillView): number {
  if (view.kind === "late") return -1000 - view.days;
  if (view.kind === "due_today") return 0;
  return view.days;
}

function selectReminderBills(bills: DueBill[], today: string, leadDays: number): ReminderBillView[] {
  const views: ReminderBillView[] = [];
  for (const bill of bills) {
    if (!needsPaymentReminder(bill.status)) continue;
    if (!isWithinReminderWindow(bill.dueDate, today, leadDays)) continue;
    const cls = classifyDue(bill.dueDate, today);
    if (!cls) continue;
    views.push({
      amount: bill.amount,
      monthName: MONTH_NAMES[bill.month - 1] ?? "Unknown",
      year: bill.year,
      kind: cls.kind,
      days: cls.days,
      label: billLabel(cls.kind, cls.days),
    });
  }
  views.sort((a, b) => urgencyRank(a) - urgencyRank(b));
  return views;
}

function buildPaymentReminderMessage(name: string, views: ReminderBillView[], link: string, pgName?: string | null): string {
  if (views.length === 0) return "";
  const tenantName = (name ?? "").trim() || "Tenant";
  const pg = (pgName ?? "").trim() || "your PG";
  const count = views.length;
  const noun = count === 1 ? "pending payment" : "pending payments";
  const lines = views
    .map((v, i) => `${i + 1}. ₹${v.amount} for ${v.monthName} ${v.year} — ${v.label}`)
    .join("\n");
  return (
    `Hi ${tenantName},\n\n` +
    `You have ${count} ${noun} for ${pg}:\n\n` +
    `${lines}\n\n` +
    `View all your dues and pay securely here:\n${link}\n\n` +
    `If you've already paid, please ignore this message. Thank you!`
  );
}

function newPaymentToken(): string {
  let out = "";
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    out += TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)];
  }
  return out;
}

function buildPaymentLink(base: string, token: string): string {
  const trimmed = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${trimmed}/${token}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// deno-lint-ignore no-explicit-any
async function ensurePaymentPortalToken(supabase: any, tenantId: number, existing: string | null): Promise<string | null> {
  if (existing) return existing;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = newPaymentToken();
    const { data, error } = await supabase
      .from("tenants_table")
      .update({ payment_portal_token: candidate })
      .is("payment_portal_token", null)
      .eq("id", tenantId)
      .select("payment_portal_token")
      .maybeSingle();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) continue;
      return null;
    }
    if (data?.payment_portal_token) return data.payment_portal_token;
    // Row not updated — re-read in case a token was set concurrently.
    const { data: cur } = await supabase
      .from("tenants_table")
      .select("payment_portal_token")
      .eq("id", tenantId)
      .maybeSingle();
    return cur?.payment_portal_token ?? null;
  }
  return null;
}

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const chatbotApiUrl = Deno.env.get("CHATBOT_API_URL") ?? "";
  const serviceKey = Deno.env.get("INTERNAL_SERVICE_KEY") ?? "";
  const portalBase = Deno.env.get("PAYMENT_PORTAL_BASE") ?? DEFAULT_PORTAL_BASE;

  if (!chatbotApiUrl || !serviceKey) {
    console.error(
      "payment-reminders is misconfigured: CHATBOT_API_URL and/or INTERNAL_SERVICE_KEY are not set."
    );
    return new Response(
      JSON.stringify({ success: false, error: "missing_configuration" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const today = toCalendarDate(new Date());

  // Pull every unpaid bill (pending/late) joined to its tenant. submitted/paid
  // are excluded by the status filter (reminders stop at under-review/paid).
  const { data: rows, error } = await supabase
    .from("payments")
    .select(`
      id,
      total_amount,
      status,
      due_date,
      month,
      year,
      tenant_id,
      tenants_table!inner (
        id,
        name,
        owner_id,
        mobile_number,
        payment_portal_token,
        payment_reminder_last_date,
        status
      )
    `)
    .in("status", ["pending", "late"]);

  if (error) {
    console.error("Error fetching unpaid payments for reminders:", error);
    return new Response(JSON.stringify(error), { status: 500 });
  }

  // Group bills by tenant.
  interface TenantGroup {
    id: number;
    name: string | null;
    owner_id: string;
    mobile_number: string | null;
    payment_portal_token: string | null;
    payment_reminder_last_date: string | null;
    status: string | null;
    bills: DueBill[];
  }
  const groups = new Map<number, TenantGroup>();

  for (const row of rows || []) {
    // deno-lint-ignore no-explicit-any
    const t = (row as any).tenants_table;
    const tenant = Array.isArray(t) ? t[0] : t;
    if (!tenant) continue;
    if (tenant.status === "moved_out") continue; // skip tenants who have left

    let group = groups.get(tenant.id);
    if (!group) {
      group = {
        id: tenant.id,
        name: tenant.name,
        owner_id: tenant.owner_id,
        mobile_number: tenant.mobile_number,
        payment_portal_token: tenant.payment_portal_token,
        payment_reminder_last_date: tenant.payment_reminder_last_date,
        status: tenant.status,
        bills: [],
      };
      groups.set(tenant.id, group);
    }
    group.bills.push({
      amount: row.total_amount,
      month: row.month,
      year: row.year,
      dueDate: row.due_date,
      status: row.status,
    });
  }

  // Resolve each owner's PG name so messages use it in place of the brand name.
  const ownerIds = [...new Set([...groups.values()].map((g) => String(g.owner_id)))];
  const pgByOwner = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: pgRows } = await supabase
      .from("pg_details")
      .select("owner_id, pg_name")
      .in("owner_id", ownerIds);
    for (const r of pgRows || []) {
      if (r.pg_name) pgByOwner.set(String(r.owner_id), r.pg_name);
    }
  }

  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let needsSend = false;

  for (const tenant of groups.values()) {
    // Once-per-calendar-day guard.
    if (tenant.payment_reminder_last_date === today) {
      skippedCount++;
      continue;
    }

    // In-window, still-unpaid bills only.
    const views = selectReminderBills(tenant.bills, today, REMINDER_LEAD_DAYS);
    if (views.length === 0) {
      // No bill is in the reminder window yet — leave eligible for a later day.
      skippedCount++;
      continue;
    }

    // Space out sends so WhatsApp does not flag the sender (except before the
    // very first send).
    if (needsSend) await sleep(SEND_DELAY_MS);
    needsSend = true;

    const markProcessedToday = async () => {
      const { error: stampErr } = await supabase
        .from("tenants_table")
        .update({ payment_reminder_last_date: today })
        .eq("id", tenant.id);
      if (stampErr) {
        console.error(`Failed to stamp payment_reminder_last_date for tenant ${tenant.id}:`, stampErr);
      }
    };

    if (!tenant.mobile_number) {
      await markProcessedToday();
      failedCount++;
      continue;
    }

    const token = await ensurePaymentPortalToken(supabase, tenant.id, tenant.payment_portal_token);
    if (!token) {
      console.error(`Could not ensure payment_portal_token for tenant ${tenant.id}; skipping.`);
      await markProcessedToday();
      failedCount++;
      continue;
    }

    const link = buildPaymentLink(portalBase, token);
    const message = buildPaymentReminderMessage(
      tenant.name ?? "",
      views,
      link,
      pgByOwner.get(String(tenant.owner_id)) ?? null
    );

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
        console.error(`Payment reminder returned non-success (${response.status}) for tenant ${tenant.id}.`);
      }
    } catch (err) {
      console.error(`Payment reminder delivery threw for tenant ${tenant.id}:`, err);
      ok = false;
    }

    if (ok) {
      sentCount++;
    } else {
      failedCount++;
    }

    // Exactly one attempt per calendar day regardless of outcome.
    await markProcessedToday();
  }

  return new Response(
    JSON.stringify({ success: true, sentCount, failedCount, skippedCount }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
