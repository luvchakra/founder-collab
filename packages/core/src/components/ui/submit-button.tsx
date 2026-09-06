"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import type { VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { Button, buttonVariants } from "./button";

type SubmitButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Label shown while the action is running, e.g. "Saving..." */
    pendingText?: string;
  };

export function SubmitButton({
  children,
  pendingText,
  disabled,
  variant,
  size,
  className,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      className={className}
      disabled={pending || disabled}
      aria-busy={pending}
      {...props}
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {pendingText ?? "Working..."}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
