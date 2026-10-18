import type { Db } from "@steward/db";

import type { Actor } from "../auth/actor";
import type { Auth } from "../auth/better-auth";

/** What every service call receives. Route handlers build it; services never read the request. */
export interface ServiceContext {
  db: Db;
  auth: Auth;
  actor: Actor | null;
  now: () => Date;
  ip: string | null;
  headers: Headers;
}
