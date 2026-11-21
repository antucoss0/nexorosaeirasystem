"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { localDB, type ClientDB } from "@/lib/local";
const Context = createContext<{
  online: boolean;
  pending: number;
  sync: () => Promise<void>;
  db: ClientDB | null;
  revision: number;
}>({ online: false, pending: 0, sync: async () => {}, db: null, revision: 0 });
export const useConnectivity = () => useContext(Context);
export function Connectivity({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [simulated, setSimulated] = useState(false);
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const lock = useRef(false);
  const onlineRef = useRef(false);
  const [db, setDB] = useState<ClientDB | null>(null);
  useEffect(() => {
    setDB(localDB(userId));
    setSimulated(localStorage.getItem("eira-offline") === "true");
    setConnected(navigator.onLine);
    setReady(true);
    const change = () => setConnected(navigator.onLine);
    addEventListener("online", change);
    addEventListener("offline", change);
    if (
      "serviceWorker" in navigator &&
      navigator.onLine &&
      localStorage.getItem("eira-offline") !== "true"
    )
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      removeEventListener("online", change);
      removeEventListener("offline", change);
    };
  }, [userId]);
  const online = ready && connected && !simulated;
  onlineRef.current = online;
  const sync = useCallback(async () => {
    if (!db || !onlineRef.current || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const ops = await db.outbox.orderBy("createdAt").toArray();
      if (ops.length) {
        if (!onlineRef.current) return;
        const res = await fetch("/api/sync/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ops: ops.slice(0, 100) }),
        });
        const data = await res.json();
        if (!res.ok) throw Error(data.error || "No se pudo enviar");
        await db.transaction(
          "rw",
          [db.patients, db.attentions, db.jornadas, db.outbox],
          async () => {
            for (const result of data.results) {
              const op = ops.find((o) => o.opId === result.opId)!;
              const table = db[op.table];
              if (result.remap) {
                await table.delete(result.remap.from);
                await db.attentions
                  .where("paciente_uuid")
                  .equals(result.remap.from)
                  .modify({ paciente_uuid: result.remap.to });
                const queued = await db.outbox.toArray();
                for (const q of queued) {
                  let changed = false;
                  if (q.entityId === result.remap.from) {
                    q.entityId = result.remap.to;
                    changed = true;
                  }
                  if (q.patch.paciente_uuid === result.remap.from) {
                    q.patch.paciente_uuid = result.remap.to;
                    changed = true;
                  }
                  if (changed) await db.outbox.put(q);
                }
              }
              const queued = await db.outbox.get(op.opId);
              const changed = queued
                ? Object.fromEntries(
                    Object.entries(queued.patch).filter(
                      ([k, v]) =>
                        JSON.stringify(v) !== JSON.stringify(op.patch[k]),
                    ),
                  )
                : {};
              if (Object.keys(changed).length && result.status === "applied")
                await db.outbox.add({
                  ...op,
                  opId: crypto.randomUUID(),
                  entityId: result.entityId,
                  type: "update",
                  patch: changed,
                  baseVersion: result.record.version,
                  createdAt: new Date().toISOString(),
                });
              const remaining = await db.outbox
                .where("entityId")
                .equals(result.entityId)
                .toArray();
              const newer = remaining.filter(
                (q) =>
                  q.opId !== op.opId &&
                  !data.results.some((r: any) => r.opId === q.opId),
              );
              const record = result.record || result.server;
              await table.put({
                ...record,
                ...Object.assign({}, ...newer.map((o) => o.patch)),
                sync_status:
                  result.status === "conflict"
                    ? "conflict"
                    : newer.length
                      ? "pending"
                      : "synced",
              });
              await db.outbox.delete(op.opId);
            }
          },
        );
      }
      if (!onlineRef.current) return;
      const since = (await db.meta.get("cursor"))?.value || "";
      const res = await fetch(
        "/api/sync/pull?since=" + encodeURIComponent(since),
      );
      const data = await res.json();
      if (!res.ok) throw Error(data.error || "No se pudo descargar");
      await db.transaction(
        "rw",
        [db.patients, db.attentions, db.jornadas, db.outbox, db.meta],
        async () => {
          for (const name of ["patients", "attentions", "jornadas"] as const) {
            for (const record of data[name]) {
              const prev = await db[name].get(record.id);
              if (
                prev?.sync_status === "pending" ||
                prev?.sync_status === "conflict"
              )
                continue;
              await db[name].put({ ...record, sync_status: "synced" });
            }
          }
          await db.meta.put({ key: "cursor", value: data.cursor });
        },
      );
      setRevision((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de sincronización");
    } finally {
      lock.current = false;
      setBusy(false);
      if (db) setPending(await db.outbox.count());
    }
  }, [db]);
  useEffect(() => {
    if (online) {
      void sync();
      navigator.serviceWorker?.ready
        .then((reg) => {
          reg.active?.postMessage({
            type: "CACHE_SHELL",
            path: location.pathname,
          });
        })
        .catch(() => {});
    }
  }, [online, sync]);
  useEffect(() => {
    if (!db) return;
    const id = setInterval(() => {
      void db.outbox.count().then(setPending);
    }, 700);
    return () => clearInterval(id);
  }, [db]);
  return (
    <Context.Provider value={{ online, pending, sync, db, revision }}>
      <div className="connectivity">
        <span className={online ? "status-dot" : "status-dot offline"} />
        {online ? <Wifi size={16} /> : <WifiOff size={16} />}
        <strong>
          {online ? "Online" : "Offline" + (simulated ? " simulado" : "")}
        </strong>
        <label className="offline-toggle">
          <input
            type="checkbox"
            checked={simulated}
            onChange={async (e) => {
              const value = e.target.checked;
              onlineRef.current = false;
              localStorage.setItem("eira-offline", String(value));
              const worker = navigator.serviceWorker?.controller;
              if (worker)
                await new Promise<void>((resolve) => {
                  const channel = new MessageChannel();
                  channel.port1.onmessage = () => resolve();
                  worker.postMessage({ type: "OFFLINE", value }, [
                    channel.port2,
                  ]);
                  setTimeout(resolve, 1000);
                });
              setSimulated(value);
            }}
          />{" "}
          Offline simulado
        </label>
        <span className="pending">{pending} operaciones pendientes</span>
        <button
          className="sync-button"
          disabled={!online || busy}
          onClick={() => void sync()}
        >
          <RefreshCw size={15} className={busy ? "spin" : ""} />
          {busy ? "Sincronizando…" : "Sincronizar ahora"}
        </button>
      </div>
      {error && (
        <p role="alert" className="error banner">
          {error}. Los cambios locales permanecen guardados.
        </p>
      )}
      {children}
    </Context.Provider>
  );
}
