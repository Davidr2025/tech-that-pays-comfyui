/**
 * Write path for the prototype. Like the read path (prototype.ts) it touches only PrototypeModule rows
 * and session status; it never reads private session data. Callers must already have passed
 * `guardSession`: only the owning consultant edits a prototype.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/db";
import { applyEdit, EditRejected, OP_MODULE, type PrototypeEdit } from "../lib/prototype/edit";
import { MODULE_SCHEMAS, parseModule, type PrototypeModuleView } from "../lib/prototype/schema";

export class PrototypeEditError extends Error {
  constructor(
    public code: "NOT_FOUND" | "INVALID" | "CONFLICT",
    message: string,
  ) {
    super(message);
  }
}

export async function editPrototype(sessionId: string, edit: PrototypeEdit): Promise<PrototypeModuleView> {
  const row = await prisma.prototypeModule.findFirst({ where: { id: edit.moduleId, sessionId }, include: { session: { select: { status: true } } } });
  if (!row) throw new PrototypeEditError("NOT_FOUND", "That part of the prototype was not found.");
  if (row.session.status === "COMPLETED") throw new PrototypeEditError("CONFLICT", "This session is complete, so its prototype can no longer be changed.");
  const type = OP_MODULE[edit.op];
  if (row.moduleType !== type) throw new PrototypeEditError("INVALID", "That change does not apply to this part of the prototype.");

  const current = parseModule(row.moduleType, row.data);
  if (!current) throw new PrototypeEditError("NOT_FOUND", "That part of the prototype was not found.");

  let next: unknown;
  try {
    next = applyEdit(type as never, current.data as never, edit, () => `x${randomUUID().slice(0, 8)}`);
  } catch (err) {
    if (err instanceof EditRejected) throw new PrototypeEditError("INVALID", err.message);
    throw err;
  }
  // Whatever the operation produced must still be a valid module: the schema is the final word.
  const validated = MODULE_SCHEMAS[type].parse(next);
  await prisma.prototypeModule.update({ where: { id: row.id }, data: { data: validated as object } });
  return { id: row.id, title: row.title, module: { type, data: validated } as PrototypeModuleView["module"] };
}
