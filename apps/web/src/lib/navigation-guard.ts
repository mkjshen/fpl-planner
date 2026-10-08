// A single, app-wide hook for "you have unsaved changes" — the planner
// registers a handler while its plan is dirty, and every in-app way of
// leaving it (gameweek arrows, the app header's wordmark and sign-out)
// asks here first. Client navigation never fires `beforeunload`, so without
// this a half-built plan was silently dropped the moment the planner
// remounted for another gameweek.
//
// A handler receives `proceed` (the navigation it intercepted) and returns
// true when it took over (e.g. opened a confirm dialog that will call
// `proceed` itself if the user chooses to leave).
type Guard = (proceed: () => void) => boolean;

let guard: Guard | null = null;

export function setNavigationGuard(next: Guard | null) {
  guard = next;
}

// Returns true when a registered guard intercepted the navigation; the
// caller must then not navigate itself.
export function guardNavigation(proceed: () => void): boolean {
  return guard ? guard(proceed) : false;
}
