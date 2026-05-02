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
  MAX_ENTRY_CONTENT_CHARS,
  MAX_ENTRY_TITLE_CHARS,
} from "./limits";

async function gateAndContext() {
  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  const onboarding = await getOnboardingState();
  if (!isOnboardingComplete(onboarding)) redirect("/onboarding");

  const ctx = await supabaseForUser();
  if (!ctx) redirect("/sign-in");

  return ctx;
}

function readId(formData: FormData): string {
  const raw = formData.get("id");
  return typeof raw === "string" ? raw : "";
}

function parseTitle(formData: FormData): string | null {
  const raw = formData.get("title");
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, MAX_ENTRY_TITLE_CHARS);
}

function parseContent(formData: FormData): string {
  const raw = formData.get("content");
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";
  return trimmed.slice(0, MAX_ENTRY_CONTENT_CHARS);
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
  redirect("/journal");
}

export async function updateEntry(formData: FormData): Promise<void> {
  const ctx = await gateAndContext();

  const id = readId(formData);
  if (!id) redirect("/journal");

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
  redirect(`/journal/${id}`);
}

// Sets flagged_for_session to the explicit value passed (rather than
// read-then-flip) so concurrent toggles in two tabs converge.
export async function toggleFlag(formData: FormData): Promise<void> {
  const ctx = await gateAndContext();

  const id = readId(formData);
  if (!id) redirect("/journal");

  const target = parseBoolean(formData, "flagged");

  const { error } = await ctx.client
    .from("journal_entries")
    .update({ flagged_for_session: target })
    .eq("id", id);
  if (error) throw error;

  revalidatePath("/journal");
  revalidatePath(`/journal/${id}`);
  revalidatePath("/sessions");
}

export async function deleteEntry(formData: FormData): Promise<void> {
  const ctx = await gateAndContext();

  const id = readId(formData);
  if (!id) redirect("/journal");

  const { error } = await ctx.client
    .from("journal_entries")
    .delete()
    .eq("id", id);
  if (error) throw error;

  revalidatePath("/journal");
  revalidatePath("/sessions");
  redirect("/journal");
}
