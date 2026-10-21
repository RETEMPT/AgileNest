import { ACCOUNT_HEADER, ACCOUNT_CHANGED_EVENT, ACCOUNT_CHANGED_MESSAGE } from "./account-context";

export async function accountFetch(input: string, init: RequestInit = {}) {
  if (!input.startsWith("/api/")) throw new Error("账号请求只能发往当前网站 API");
  const accountId = typeof document === "undefined" ? "" : document.querySelector("[data-agilenest-account]")?.getAttribute("data-agilenest-account") ?? "";
  const headers = new Headers(init.headers);
  headers.set(ACCOUNT_HEADER, accountId);
  const controller = new AbortController();
  const changed = () => controller.abort(new Error(ACCOUNT_CHANGED_MESSAGE));
  if (typeof window !== "undefined") window.addEventListener(ACCOUNT_CHANGED_EVENT, changed);
  try {
    const response = await fetch(input, { ...init, headers, cache: "no-store", credentials: "same-origin", signal: init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal });
    if (response.status === 401 || response.status === 409 && response.headers.get("X-AgileNest-Account-Changed") === "1") {
      if (typeof window !== "undefined") window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT));
    }
    return response;
  } finally {
    if (typeof window !== "undefined") window.removeEventListener(ACCOUNT_CHANGED_EVENT, changed);
  }
}
