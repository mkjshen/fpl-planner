"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";

// Must be rendered as a *child* of the <form> it belongs to — useFormStatus
// only sees the nearest enclosing form's pending state, not one passed in
// as a prop. Swaps its label and disables itself while the form's server
// action is in flight, so a slow request (team import hits the real FPL
// API) doesn't look inert and inviting a second click.
export function SubmitButton({
  children,
  pendingLabel,
  className,
  ...rest
}: {
  children: ReactNode;
  pendingLabel: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "children" | "disabled">) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`focus-ring ${className ?? ""}`} {...rest}>
      {pending ? pendingLabel : children}
    </button>
  );
}
