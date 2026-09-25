"use client";

import { useEffect, useState } from "react";
import { Input } from "@cofounderai/core/ui/input";

function toLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * A date-and-time picker that submits an unambiguous UTC timestamp. A bare
 * `datetime-local` value has no time zone, so the server (running in UTC) would read a
 * founder's "10:00" in India as 10:00 UTC — five and a half hours late. The browser knows
 * the user's zone, so the conversion happens here.
 */
export function LocalDateTimeInput({
  id,
  name,
  defaultValue,
  required,
}: {
  id: string;
  name: string;
  defaultValue?: string | null;
  required?: boolean;
}) {
  // Filled after mount: the server renders in UTC and would disagree with the browser.
  const [local, setLocal] = useState("");
  useEffect(() => setLocal(toLocalValue(defaultValue)), [defaultValue]);
  const iso = local ? new Date(local).toISOString() : "";
  return (
    <>
      <Input id={id} type="datetime-local" required={required} value={local} onChange={(e) => setLocal(e.target.value)} />
      <input type="hidden" name={name} value={iso} />
    </>
  );
}
