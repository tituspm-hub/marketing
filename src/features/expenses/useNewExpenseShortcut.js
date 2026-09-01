import { useEffect } from "react";

// Adding an expense is the one action logged many times a day, so it gets the one
// keystroke. Everything else stays a click.
export function useNewExpenseShortcut(onNew) {
  useEffect(() => {
    function onKey(event) {
      const busyTyping =
        /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable;
      if (event.key !== "n" || busyTyping || event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      onNew();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNew]);
}

// Scroll first, focus second: focusing alone jumps the page with no sense of where it
// went, which is what the header button used to do. scrollIntoView is called
// optionally because not every environment that renders this app implements it.
export function focusExpenseForm() {
  document.getElementById("expense-form")
    ?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  window.setTimeout(
    () => document.getElementById("description")?.focus({ preventScroll: true }), 260);
}
