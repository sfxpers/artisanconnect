import type { BatchItem } from "drizzle-orm/batch";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import type { DomainConfig, Ports } from "./ports";
import * as schema from "./schema";

export type Db = DrizzleD1Database<typeof schema>;

/** One statement of a domain event's batch. */
export type Write = BatchItem<"sqlite">;

/** What every command, query, and clock inside the module works with. */
export type Context = {
  db: Db;
  ports: Ports;
  config: DomainConfig;
  now(): Date;
  newId(): string;
  /**
   * Writes one domain event: every row in one atomic D1 batch, so either all
   * of them land or none do.
   */
  commit(writes: Write[]): Promise<void>;
};

export function createContext(ports: Ports, config: DomainConfig): Context {
  const db = drizzle(ports.db, { schema });
  return {
    db,
    ports,
    config,
    now: () => ports.clock.now(),
    newId: () => crypto.randomUUID(),
    async commit(writes) {
      const [first, ...rest] = writes;
      if (first) await db.batch([first, ...rest]);
    },
  };
}
