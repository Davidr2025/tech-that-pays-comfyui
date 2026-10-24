import { PrismaClient } from "@prisma/client";
import path from "node:path";

// Zero-config default: a local SQLite file. Export DATABASE_URL to use anything else.
process.env.DATABASE_URL ??= `file:${path.join(process.cwd(), "prisma", "dev.db")}`;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
