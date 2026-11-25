"use server";

import { revalidatePath } from "next/cache";
import { currentUserId } from "@/lib/auth";
import { claimAnalysis } from "@/lib/db";

export async function claim(id: string) {
  const userId = await currentUserId();
  if (!userId) return; // trust boundary: only signed-in users can save
  await claimAnalysis(String(id).slice(0, 40), userId);
  revalidatePath(`/r/${id}`);
}
