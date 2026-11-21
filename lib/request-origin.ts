export function requestOrigin(req: Request) {
  const first = (name: string) => req.headers.get(name)?.split(",")[0].trim();
  const url = new URL(req.url);
  const host = first("x-forwarded-host") || req.headers.get("host") || url.host;
  const protocol = first("x-forwarded-proto") || url.protocol.slice(0, -1);
  if (
    !/^(\[[a-f\d:]+\]|[a-z\d.-]+)(:\d{1,5})?$/i.test(host) ||
    !["http", "https"].includes(protocol)
  )
    throw new Error("Origen de solicitud inválido");
  return new URL(`${protocol}://${host}`).origin;
}
