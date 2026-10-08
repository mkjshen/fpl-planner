"use client";

import { type ReactNode, type SubmitEvent, useRef } from "react";
import { guardNavigation } from "@/lib/navigation-guard";

// A form whose submission leaves the page (sign-out), held back by the
// planner's unsaved-changes guard: the first submit asks, and only a
// confirmed "leave" re-submits it for real.
export function GuardedForm({
  action,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    if (confirmed.current) return;
    const intercepted = guardNavigation(() => {
      confirmed.current = true;
      formRef.current?.requestSubmit();
    });
    if (intercepted) event.preventDefault();
  }

  return (
    <form ref={formRef} action={action} onSubmit={handleSubmit}>
      {children}
    </form>
  );
}
