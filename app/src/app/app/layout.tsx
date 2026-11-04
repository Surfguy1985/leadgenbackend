import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase";
export const dynamic = "force-dynamic";

/**
 * Server-side authentication gate for every /app route, including client-rendered
 * saved searches, settings, privacy and support pages. This prevents anonymous
 * users viewing even account-only shell content.
 */
export default async function ContractorLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await currentUser();
  if (!session) redirect("/login?next=/app");
  const { data: org } = await session.db.from("organizations").select("id")
    .eq("owner_user_id", session.user.id).eq("kind", "contractor").maybeSingle();
  if (!org) redirect("/onboarding");
  return children;
}
