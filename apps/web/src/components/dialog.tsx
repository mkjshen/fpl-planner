"use client";

import { createContext, type ReactNode, useContext, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Every open dialog. Dialogs nest (a player's profile opens from inside the
// mobile transfer dialog), and only the innermost should answer Escape or
// keep Tab inside itself — otherwise the outer dialog's focus trap would
// pull focus straight back out of the inner one, which is portaled
// elsewhere in the DOM. Nesting depth comes from React context rather than
// mount order: when both mount together, React runs the inner dialog's
// effect first, so "last registered" would wrongly pick the outer one.
type OpenDialog = { id: symbol; depth: number; order: number };
const openDialogs: OpenDialog[] = [];
let mountCounter = 0;

// The page's own overflow styles from before the first dialog opened —
// saved once and restored when the last one closes. Saving per dialog
// would let an outer dialog record the inner one's "hidden" as the
// original whenever both mount together.
let savedOverflow: { root: string; body: string } | null = null;

const DialogDepth = createContext(0);

function isTopmost(id: symbol): boolean {
  let top: OpenDialog | undefined;
  for (const dialog of openDialogs) {
    if (!top || dialog.depth > top.depth || (dialog.depth === top.depth && dialog.order > top.order)) {
      top = dialog;
    }
  }
  return top?.id === id;
}

// The one modal primitive every overlay in the app goes through, so they
// all behave like real dialogs: Escape closes, Tab stays inside, focus
// moves in on open and returns to whatever opened it on close, and the page
// behind doesn't scroll. Rendered conditionally by the caller (mount =
// open), into document.body via a portal — a dialog opened from inside the
// planner's `md:sticky` sidebar would otherwise sit in that sticky
// ancestor's stacking context and could paint behind unrelated content no
// matter how high its z-index.
export function Dialog({
  onClose,
  canClose = true,
  role = "dialog",
  label,
  labelledBy,
  overlayClassName = "items-center",
  className,
  children,
}: {
  onClose: () => void;
  // False while something irreversible is in flight (e.g. a reset request),
  // so neither Escape nor a backdrop click can dismiss it halfway.
  canClose?: boolean;
  role?: "dialog" | "alertdialog";
  label?: string;
  labelledBy?: string;
  // Positioning of the panel within the backdrop (e.g. bottom sheet).
  overlayClassName?: string;
  className?: string;
  children: ReactNode;
}) {
  const depth = useContext(DialogDepth);
  const panelRef = useRef<HTMLDivElement>(null);
  // Read through refs inside the mount-only effect below, so the latest
  // callback/flag is used without re-running (and re-trapping) the effect
  // every render.
  const onCloseRef = useRef(onClose);
  const canCloseRef = useRef(canClose);
  useEffect(() => {
    onCloseRef.current = onClose;
    canCloseRef.current = canClose;
  });

  useEffect(() => {
    const id = Symbol("dialog");
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;

    // Lock the page behind from scrolling. Both <html> and <body>: whichever
    // the browser treats as the scrolling element is the one that matters.
    const root = document.documentElement;
    if (openDialogs.length === 0) {
      savedOverflow = { root: root.style.overflow, body: document.body.style.overflow };
    }
    openDialogs.push({ id, depth, order: mountCounter++ });
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    // Respect an element inside that already took focus (e.g. a search
    // input's autoFocus); otherwise land on whatever the caller marked
    // `data-autofocus` (the safe choice in a destructive confirm), then the
    // first control, then the panel itself so screen readers announce it.
    if (panel && !panel.contains(document.activeElement)) {
      const preferred =
        panel.querySelector<HTMLElement>("[data-autofocus]") ?? panel.querySelector<HTMLElement>(FOCUSABLE);
      (preferred ?? panel).focus();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!isTopmost(id) || !panel) return;
      if (event.key === "Escape") {
        if (!canCloseRef.current) return;
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      openDialogs.splice(
        openDialogs.findIndex((dialog) => dialog.id === id),
        1,
      );
      // Only the last dialog to close restores page scrolling.
      if (openDialogs.length === 0 && savedOverflow) {
        root.style.overflow = savedOverflow.root;
        document.body.style.overflow = savedOverflow.body;
        savedOverflow = null;
      }
      // The opener may have unmounted meanwhile (e.g. a card that was
      // transferred out from inside the dialog) — then there's nothing
      // sensible to return to.
      if (opener?.isConnected) opener.focus();
    };
    // `depth` is fixed for a dialog's lifetime (it's where it sits in the
    // tree), so mount-only is correct here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div
      className={`fixed inset-0 z-[60] flex justify-center bg-black/40 p-4 backdrop-blur-sm ${overlayClassName}`}
      onClick={() => canClose && onClose()}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`outline-none ${className ?? ""}`}
      >
        <DialogDepth.Provider value={depth + 1}>{children}</DialogDepth.Provider>
      </div>
    </div>,
    document.body,
  );
}
