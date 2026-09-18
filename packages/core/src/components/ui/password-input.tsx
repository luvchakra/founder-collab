"use client";

import { useId, useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "./input";
import { cn } from "../../lib/utils";

/**
 * A password field that can be revealed.
 *
 * Typing a password you cannot see is the one moment in signing up where a typo costs you
 * the whole attempt — and on a phone, with autocorrect and a cramped keyboard, it is not a
 * rare one. Letting someone check what they typed is the difference between a failed login
 * they don't understand and one they fix in a second.
 *
 * The toggle is a real `<button>`, not an icon with a click handler: it has to be
 * reachable by keyboard and announced to a screen reader, and it must never submit the
 * form it sits inside — hence the explicit `type="button"`.
 *
 * Revealing is deliberately not sticky across fields or visits. The default is always
 * hidden, so a password is never on screen because of a choice made on some earlier page.
 */
export function PasswordInput({
  className,
  id,
  ...props
}: Omit<ComponentProps<typeof Input>, "type">) {
  const [revealed, setRevealed] = useState(false);
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="relative">
      <Input
        {...props}
        id={inputId}
        type={revealed ? "text" : "password"}
        // Room for the button, so a long password never runs underneath it.
        className={cn("pr-10", className)}
      />
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        // The label says what the button will do, not what the field is currently doing —
        // that is what a screen reader user needs to decide whether to press it.
        aria-label={revealed ? "Hide password" : "Show password"}
        aria-controls={inputId}
        aria-pressed={revealed}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {revealed ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
