"use client";
import Dexie, { type Table } from "dexie";
import type { Operation } from "./sync";
export type LocalRecord = {
  id: string;
  version: number;
  sync_status?: string;
  [key: string]: any;
};
class LocalDB extends Dexie {
  patients!: Table<LocalRecord, string>;
  attentions!: Table<LocalRecord, string>;
  jornadas!: Table<LocalRecord, string>;
  decisions!: Table<LocalRecord, string>;
  outbox!: Table<Operation, string>;
  meta!: Table<{ key: string; value: string }, string>;
  constructor(userId: string) {
    super(`eira-${userId}`);
    this.version(1).stores({
      patients: "id,nombre_normalizado,sync_status",
      attentions: "id,paciente_uuid",
      jornadas: "id,municipio",
      outbox: "opId,createdAt,entityId",
      meta: "key",
    });
    this.version(2).stores({ decisions: "id" });
  }
}
export type ClientDB = LocalDB;
const databases = new Map<string, LocalDB>();
export function localDB(id: string) {
  if (!databases.has(id)) databases.set(id, new LocalDB(id));
  return databases.get(id)!;
}
let lastWrite = 0;
export async function localWrite(
  db: LocalDB,
  table: Operation["table"],
  entityId: string,
  patch: Record<string, any>,
  type: "create" | "update" = "create",
) {
  await db.transaction("rw", [db[table], db.outbox], async () => {
    const prev = await db[table].get(entityId);
    const queued = (
      await db.outbox.where("entityId").equals(entityId).toArray()
    ).find((o) => o.table === table);
    const op: Operation = queued
      ? { ...queued, patch: { ...queued.patch, ...patch } }
      : {
          opId: crypto.randomUUID(),
          table,
          entityId,
          type,
          patch,
          baseVersion: prev?.version || 0,
          createdAt: new Date(
            (lastWrite = Math.max(Date.now(), lastWrite + 1)),
          ).toISOString(),
        };
    if (table === "attentions" && patch.form_data) {
      op.patch = {
        ...op.patch,
        form_data: { ...queued?.patch.form_data, ...patch.form_data },
      };
    }
    await db[table].put({
      ...prev,
      ...patch,
      ...(table === "attentions" && patch.form_data
        ? { form_data: { ...prev?.form_data, ...patch.form_data } }
        : {}),
      id: entityId,
      version: prev?.version || 0,
      sync_status: "pending",
    });
    await db.outbox.put(op);
  });
}
