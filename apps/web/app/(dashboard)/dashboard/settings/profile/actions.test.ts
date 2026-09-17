/**
 * Profile and avatar. The avatar action is the security-relevant one: the storage path is
 * prefixed with the uploader's own user id, which is exactly what the bucket's RLS policy
 * checks against auth.uid() — a path that did not start with it would either be rejected
 * or, worse, let someone write under another user's prefix. The MIME allowlist and size
 * cap run before any upload is attempted.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type QueryResult, type RecordedStorage } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  unstable_rethrow: vi.fn((error: unknown) => {
    if (error instanceof Error && error.message.startsWith("NEXT_")) throw error;
  }),
  revalidatePath: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("next/navigation", () => ({ unstable_rethrow: h.unstable_rethrow }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@cofounderai/core/db/server", () => ({ createClient: h.createClient }));

const { updateAvatarAction, updateProfileAction } = await import("./actions");

const USER = { id: "u1" };

function mockClient(options: {
  user?: unknown;
  updateUserError?: unknown;
  storage?: (call: RecordedStorage) => QueryResult;
} = {}) {
  const updateUser = vi.fn(async () => ({ error: options.updateUserError ?? null }));
  const supabase = Object.assign(
    createFakeSupabase({
      storage:
        options.storage ??
        ((call) =>
          call.method === "getPublicUrl"
            ? { data: { publicUrl: "https://cdn.example/u1/avatar-1.png" }, error: null }
            : { data: { path: "x" }, error: null }),
    }),
    { auth: { updateUser, getUser: async () => ({ data: { user: "user" in options ? options.user : USER } }) } },
  );
  h.createClient.mockResolvedValue(supabase);
  return { supabase, updateUser };
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
}

function imageForm(file: File) {
  const data = new FormData();
  data.append("avatar", file);
  return data;
}

function image(type = "image/png", bytes = 1024, name = "me.png") {
  return new File([new Uint8Array(bytes)], name, { type });
}

beforeEach(() => vi.clearAllMocks());

describe("updateProfileAction", () => {
  it("saves the trimmed fields into user metadata", async () => {
    const { updateUser } = mockClient();

    const result = await updateProfileAction(
      null,
      form({ fullName: "  Ada  ", bio: " Builder ", phone: " +91 " }),
    );

    expect(updateUser).toHaveBeenCalledWith({
      data: { full_name: "Ada", bio: "Builder", phone: "+91" },
    });
    expect(result).toEqual({ success: true });
  });

  it("nulls a field cleared to blank, rather than storing an empty string", async () => {
    const { updateUser } = mockClient();

    await updateProfileAction(null, form({ fullName: "Ada", bio: "  ", phone: "" }));

    expect(updateUser).toHaveBeenCalledWith({
      data: { full_name: "Ada", bio: null, phone: null },
    });
  });

  it("refreshes the profile page and the dashboard, which shows the name", async () => {
    mockClient();

    await updateProfileAction(null, form({ fullName: "Ada" }));

    expect(h.revalidatePath).toHaveBeenCalledWith("/dashboard/settings/profile");
    expect(h.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("returns the provider's error as state", async () => {
    mockClient({ updateUserError: { message: "Session expired" } });

    expect(await updateProfileAction(null, form({ fullName: "Ada" }))).toEqual({
      error: "Session expired",
    });
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("updateAvatarAction — validation", () => {
  it.each([
    ["no file at all", new FormData()],
    ["an empty file", imageForm(image("image/png", 0))],
  ])("rejects %s", async (_label, data) => {
    const { supabase } = mockClient();

    expect(await updateAvatarAction(null, data)).toEqual({ error: "Choose an image to upload." });
    expect(supabase.storageCalls()).toEqual([]);
  });

  it("rejects a non-image content type before uploading anything", async () => {
    const { supabase } = mockClient();

    const result = await updateAvatarAction(null, imageForm(image("application/pdf", 10, "x.pdf")));

    expect(result).toEqual({ error: "Only PNG, JPEG, WebP, or GIF images are supported." });
    expect(supabase.storageCalls()).toEqual([]);
  });

  it.each(["image/png", "image/jpeg", "image/webp", "image/gif"])("accepts %s", async (type) => {
    const { supabase } = mockClient();

    await updateAvatarAction(null, imageForm(image(type)));

    expect(supabase.storageCalls("upload")).toHaveLength(1);
  });

  it("rejects an image over 5MB before uploading", async () => {
    const { supabase } = mockClient();

    const result = await updateAvatarAction(null, imageForm(image("image/png", 5 * 1024 * 1024 + 1)));

    expect(result).toEqual({ error: "Image must be 5MB or smaller." });
    expect(supabase.storageCalls()).toEqual([]);
  });

  it("accepts an image at exactly the cap", async () => {
    const { supabase } = mockClient();

    await updateAvatarAction(null, imageForm(image("image/png", 5 * 1024 * 1024)));

    expect(supabase.storageCalls("upload")).toHaveLength(1);
  });

  it("refuses when there is no signed-in user to attribute the path to", async () => {
    const { supabase } = mockClient({ user: null });

    expect(await updateAvatarAction(null, imageForm(image()))).toEqual({ error: "Not authenticated." });
    expect(supabase.storageCalls()).toEqual([]);
  });
});

describe("updateAvatarAction — upload", () => {
  it("prefixes the storage path with the uploader's own id, as the bucket policy requires", async () => {
    const { supabase } = mockClient();

    await updateAvatarAction(null, imageForm(image()));

    const [path] = supabase.storageCalls("upload")[0]!.args as [string];
    expect(path.split("/")[0]).toBe("u1");
    expect(supabase.storageCalls("upload")[0]!.bucket).toBe("avatars");
  });

  it("timestamps the filename so a re-upload does not fight CDN caching", async () => {
    const { supabase: first } = mockClient();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-17T00:00:00.000Z"));
      await updateAvatarAction(null, imageForm(image()));
      const a = first.storageCalls("upload")[0]!.args[0] as string;

      vi.setSystemTime(new Date("2026-09-17T00:00:01.000Z"));
      const { supabase: second } = mockClient();
      await updateAvatarAction(null, imageForm(image()));
      const b = second.storageCalls("upload")[0]!.args[0] as string;

      expect(a).not.toBe(b);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the uploaded file's extension, lowercased", async () => {
    const { supabase } = mockClient();

    await updateAvatarAction(null, imageForm(image("image/jpeg", 10, "Portrait.JPEG")));

    expect(supabase.storageCalls("upload")[0]!.args[0] as string).toMatch(/\.jpeg$/);
  });

  it("defaults the extension when the filename has none", async () => {
    const { supabase } = mockClient();

    await updateAvatarAction(null, imageForm(image("image/png", 10, "noextension")));

    expect(supabase.storageCalls("upload")[0]!.args[0] as string).toMatch(/\.png$/);
  });

  it("sends the file's own content type and allows overwrite", async () => {
    const { supabase } = mockClient();

    await updateAvatarAction(null, imageForm(image("image/webp")));

    expect(supabase.storageCalls("upload")[0]!.args[2]).toEqual({
      contentType: "image/webp",
      upsert: true,
    });
  });

  it("stores the resulting public URL on the user", async () => {
    const { updateUser } = mockClient();

    const result = await updateAvatarAction(null, imageForm(image()));

    expect(updateUser).toHaveBeenCalledWith({
      data: { avatar_url: "https://cdn.example/u1/avatar-1.png" },
    });
    expect(result).toEqual({ success: true });
  });

  it("returns a failed upload as state, without touching the user record", async () => {
    const { supabase, updateUser } = mockClient({
      storage: (call) =>
        call.method === "upload"
          ? { data: null, error: new Error("storage denied") }
          : { data: { publicUrl: "x" }, error: null },
    });

    expect(await updateAvatarAction(null, imageForm(image()))).toEqual({ error: "storage denied" });
    expect(updateUser).not.toHaveBeenCalled();
    expect(supabase.storageCalls("upload")).toHaveLength(1);
  });

  it("returns a failed metadata update as state", async () => {
    mockClient({ updateUserError: { message: "session gone" } });

    const result = await updateAvatarAction(null, imageForm(image()));

    expect(result).toMatchObject({ error: expect.any(String) });
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it("refreshes the profile page and the dashboard after a successful change", async () => {
    mockClient();

    await updateAvatarAction(null, imageForm(image()));

    expect(h.revalidatePath).toHaveBeenCalledWith("/dashboard/settings/profile");
    expect(h.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });
});
