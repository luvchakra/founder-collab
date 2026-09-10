import { redirect } from "next/navigation";
import { createClient } from "@cofounderai/core/db/server";
import { ProfileCard } from "@/components/settings/profile-card";
import { updateAvatarAction, updateProfileAction } from "./actions";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const metadata = user.user_metadata ?? {};
  const fullName = (metadata.full_name || metadata.name || "") as string;
  const avatarUrl = (metadata.avatar_url || metadata.picture || null) as string | null;

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl font-semibold">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your personal details -- visible only to you.
        </p>
      </div>

      <ProfileCard
        avatarUrl={avatarUrl}
        fullName={fullName}
        email={user.email ?? ""}
        bio={(metadata.bio ?? "") as string}
        phone={(metadata.phone ?? "") as string}
        jobTitle={(metadata.job_title ?? "") as string}
        location={(metadata.location ?? "") as string}
        timezone={(metadata.timezone ?? "") as string}
        updateProfileAction={updateProfileAction}
        updateAvatarAction={updateAvatarAction}
      />
    </main>
  );
}
