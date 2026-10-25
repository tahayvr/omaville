// The database (Postgres, or PGlite in dev and tests), with Drizzle. `pnpm db:generate` writes a migration into
// drizzle/ after a change here; the app applies migrations as it starts (db/index.js).
import { pgTable, bigserial, integer, text, boolean, jsonb, timestamp, index } from "drizzle-orm/pg-core";

// ---- the city ----

// the event log: append-only, a sequence number per row, an event id that can be appended only once (relay/log.mjs)
export const events = pgTable("events", {
  seq: bigserial("seq", { mode: "number" }).primaryKey(),
  id: text("id").notNull().unique(),
  time: integer("time").notNull(), // seconds, within 32 bits
  kind: text("kind").notNull(),
  repo: text("repo").notNull().default(""),
  private: boolean("private").notNull().default(false), // the public city never reads these
  actor: text("actor").notNull().default(""), // for the contributors' first contributions (relay.mjs: firsts)
  body: jsonb("body").notNull(), // the whole event
}, (t) => [index("events_time").on(t.time), index("events_kind_repo").on(t.kind, t.repo)]);

// the base the two cities are folded from: the latest public and members' snapshots and the master layout
export const meta = pgTable("meta", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

// replay: the first base of each UTC day; the city at a moment is the nearest one before it plus the logged events
export const checkpoints = pgTable("checkpoints", {
  day: integer("day").primaryKey(),
  now: integer("now").notNull(),
  body: jsonb("body").notNull(),
}, (t) => [index("checkpoints_now").on(t.now)]);

// ---- sign-in (Better Auth's tables, for its Drizzle adapter: server/auth.js) ----

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (t) => [index("session_user").on(t.userId)]);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull(),
}, (t) => [index("account_user").on(t.userId)]);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [index("verification_identifier").on(t.identifier)]);
