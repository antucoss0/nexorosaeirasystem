export function shouldEnableServiceWorker(hostname: string, enabled?: string) {
  return (
    enabled === "1" || ["localhost", "127.0.0.1", "[::1]"].includes(hostname)
  );
}

export function serviceWorkerContainer(): ServiceWorkerContainer | undefined {
  try {
    return navigator.serviceWorker;
  } catch {
    return undefined;
  }
}

export async function registerOptionalServiceWorker(
  hostname: string,
  enabled?: string,
  getContainer: () =>
    | Pick<ServiceWorkerContainer, "register">
    | undefined = serviceWorkerContainer,
) {
  if (!shouldEnableServiceWorker(hostname, enabled)) return;
  try {
    await getContainer()?.register("/sw.js");
  } catch {}
}
