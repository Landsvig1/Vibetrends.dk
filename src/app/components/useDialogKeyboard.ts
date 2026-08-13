"use client";

import { useCallback, useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([tabindex="-1"]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * The keyboard contract every `role="dialog"` on this site owes its user:
 * Escape closes it, focus moves into it on open, Tab cycles inside it, and
 * focus returns to whatever opened it on close.
 *
 * The dialogs here declared `aria-modal="true"` while leaving focus behind them
 * on the page, so the page stayed reachable and Escape did nothing — a keyboard
 * user could tab out of a modal but not dismiss it (WCAG 2.1.2, 2.4.3).
 *
 * It lives in one place because both dialogs on the skills hub had the same gap
 * and any third one will too. The return target is read from the document at
 * open time, which works whether the dialog is toggled by state or mounted
 * fresh by the parent — a click leaves focus on its own trigger either way.
 */
export function useDialogKeyboard(
  open: boolean,
  dialogRef: React.RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const triggerRef = useRef<HTMLElement | null>(null);

  // Held in a ref so `close` keeps one identity for the dialog's whole life.
  // Callers routinely pass an inline arrow (`onClose={() => setOpen(false)}`),
  // and depending on it directly re-ran the effect on every parent render —
  // which re-captured the return target as the dialog's own close button, so
  // dismissing dropped focus to <body> instead of back to the trigger.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const close = useCallback(() => {
    onCloseRef.current();
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const focusables = () =>
      Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => el.offsetParent !== null,
      );

    // Only capture a return target from outside the dialog. StrictMode runs
    // this effect twice on mount, and an unguarded capture recorded the
    // dialog's own close button the second time — so dismissing dropped focus
    // to <body> instead of back to the trigger.
    const active = document.activeElement as HTMLElement | null;
    if (active && active !== document.body && !dialog?.contains(active)) {
      triggerRef.current = active;
    }
    focusables()[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialog?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, dialogRef, close]);

  return { close };
}
