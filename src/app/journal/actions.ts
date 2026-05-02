"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";

import {
  getOnboardingState,
  isOnboardingComplete,
} from "@/lib/onboarding";
import { supabaseForUser } from "@/lib/supabase";

import {
  exceedsCap,
  MAX_ENTRY_CONTENT_CHARS,
  MAX_ENTRY_TITLE_CHARS,
} from "./limits";

class OverCapError extends Error {
  constructor(field: string, maxLength: number) {
    super(`${field} exceeds the ${maxLength}-character cap.`);
    this.name = "OverCapError";
  }
}

class MissingFieldError extends Error {
  constructor(field: string) {
    super(`Missing or invalid ${field}.`);
    this.name = "MissingFieldError";
  }
}

async function gateAndContext() {
  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  const onboarding = await getOnboardingState();
  if (!isOnboardingComplete(onboarding)) redirect("/onboarding");

  const ctx = await supabaseForUser();
  if (!ctx) redirect("/sign-in");

  return ctx;
}

// Reads a required entry id from the form. Throws when the field
// is missing — surfaces both crafted requests AND our own
// form-wiring bugs (Next.js + Sentry will capture the throw)
// instead of silently redirecting and masking either.
function readId(formData: FormData): string {
  const raw = formData.get("id");
  if (typeof raw !== "string" || raw.length === 0) {
    throw new MissingFieldError("entry id");
  }
  return raw;
}

// Trim + reject-over-cap. Returns null for empty/missing input; the
// caller decides whether that's a reason to redirect (create) or
// no-op (update). Throws OverCapError for over-cap input — the
// textarea has maxLength so this only fires on dev-tools / scripted
// submits that bypass the UI.
function parseTitle(formData: FormData): string | null {
  const raw = formData.get("title");
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (exceedsCap(trimmed, MAX_ENTRY_TITLE_CHARS)) {
    throw new OverCapError("title", MAX_ENTRY_TITLE_CHARS);
  }
  return trimmed;
}

function parseContent(formData: FormData): string {
  const raw = formData.get("content");
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";
  if (exceedsCap(trimmed, MAX_ENTRY_CONTENT_CHARS)) {
    throw new OverCapError("content", MAX_ENTRY_CONTENT_CHARS);
  }
  return trimmed;
}

function parseBoolean(formData: FormData, key: string): boolean {
  const raw = formData.get(key);
  return raw === "true" || raw === "on";
}

export async function createEntry(formData: FormData): Promise<void> {
  const ctx = await gateAndContext();

  const title = parseTitle(formData);
  const content = parseContent(formData);
  if (content.length === 0) redirect("/journal/new");

  const flagged = parseBoolean(formData, "flagged");

  const { error } = await ctx.client.from("journal_entries").insert({
    user_id: ctx.userId,
    title,
    content,
    flagged_for_session: flagged,
  });
  if (error) throw error;

  revalidatePath("/journal");
  revalidatePath("/sessions");
  revalidatePath("/home");
  revalidatePath("/goals");
  redirect("/journal");
}

export async function updateEntry(formData: FormData): Promise<void> {
  const ctx = await gateAndContext();

  const id = readId(formData);

  const title = parseTitle(formData);
  const content = parseContent(formData);
  if (content.length === 0) redirect(`/journal/${id}`);

  const { error } = await ctx.client
    .from("journal_entries")
    .update({ title, content })
    .eq("id", id);
  if (error) throw error;

  revalidatePath("/journal");
  revalidatePath(`/journal/${id}`);
  revalidatePath("/sessions");
  revalidatePath("/home");
  revalidatePath("/goals");
  redirect(`/journal/${id}`);
}

// Sets flagged_for_session to the explicit value passed (rather than
// read-then-flip) so concurrent toggles in two tabs converge.
export async function toggleFlag(formData: FormData): Promise<void> {
  const ctx = await gateAndContext();

  const id = readId(formData);

  const target = parseBoolean(formData, "flagged");

  const { error } = await ctx.client
    .from("journal_entries")
    .update({ flagged_for_session: target })
    .eq("id", id);
  if (error) throw error;

  revalidatePath("/journal");
  revalidatePath(`/journal/${id}`);
  revalidatePath("/sessions");
  revalidatePath("/home");
  revalidatePath("/goals");
}

export async function deleteEntry(formData: FormData): Promise<void> {
  const ctx = await gateAndContext();

  const id = readId(formData);

  const { error } = await ctx.client
    .from("journal_entries")
    .delete()
    .eq("id", id);
  if (error) throw error;

  revalidatePath("/journal");
  revalidatePath("/sessions");
  revalidatePath("/home");
  revalidatePath("/goals");
  redirect("/journal");
}
