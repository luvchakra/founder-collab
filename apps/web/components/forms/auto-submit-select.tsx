"use client";

import { NativeSelect } from "@cofounderai/core/ui/native-select";

/**
 * A NativeSelect that submits its enclosing GET form on change. Needs its own client
 * boundary: the pages that use this (e.g. the platform admin tool's user/business
 * pickers) are Server Components, and an event handler attached directly to a select
 * rendered by a Server Component can't cross the server/client boundary -- React can't
 * serialize a function prop, and doing so crashes the whole page on every load. This
 * is the smallest possible client island that keeps the rest of the page server-rendered.
 */
export function AutoSubmitSelect(props: React.ComponentProps<typeof NativeSelect>) {
  return <NativeSelect {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
