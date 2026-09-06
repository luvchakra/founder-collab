import { redirect } from "next/navigation";
import { createClient } from "@cofounderai/core/db/server";
import { AvatarUploadForm } from "@/components/settings/avatar-upload-form";
import { ProfileForm } from "@/components/settings/profile-form";
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

      <AvatarUploadForm
        avatarUrl={avatarUrl}
        name={fullName || null}
        email={user.email ?? ""}
        action={updateAvatarAction}
      />

      <ProfileForm
        defaultFullName={fullName}
        defaultBio={(metadata.bio ?? "") as string}
        defaultPhone={(metadata.phone ?? "") as string}
        email={user.email ?? ""}
        action={updateProfileAction}
      />
    </main>
  );
}
