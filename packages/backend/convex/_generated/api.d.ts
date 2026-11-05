/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as attendance from "../attendance.js";
import type * as auth from "../auth.js";
import type * as cache from "../cache.js";
import type * as chronicle from "../chronicle.js";
import type * as classes from "../classes.js";
import type * as classlist from "../classlist.js";
import type * as connect from "../connect.js";
import type * as crons from "../crons.js";
import type * as events from "../events.js";
import type * as http from "../http.js";
import type * as learners from "../learners.js";
import type * as lib_compass from "../lib/compass.js";
import type * as lib_connect from "../lib/connect.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_days from "../lib/days.js";
import type * as lib_history from "../lib/history.js";
import type * as lib_links from "../lib/links.js";
import type * as lib_match from "../lib/match.js";
import type * as lib_plan from "../lib/plan.js";
import type * as lib_target from "../lib/target.js";
import type * as plans from "../plans.js";
import type * as resources from "../resources.js";
import type * as schools from "../schools.js";
import type * as sync from "../sync.js";
import type * as teachers from "../teachers.js";
import type * as timetable from "../timetable.js";
import type * as work from "../work.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  attendance: typeof attendance;
  auth: typeof auth;
  cache: typeof cache;
  chronicle: typeof chronicle;
  classes: typeof classes;
  classlist: typeof classlist;
  connect: typeof connect;
  crons: typeof crons;
  events: typeof events;
  http: typeof http;
  learners: typeof learners;
  "lib/compass": typeof lib_compass;
  "lib/connect": typeof lib_connect;
  "lib/crypto": typeof lib_crypto;
  "lib/days": typeof lib_days;
  "lib/history": typeof lib_history;
  "lib/links": typeof lib_links;
  "lib/match": typeof lib_match;
  "lib/plan": typeof lib_plan;
  "lib/target": typeof lib_target;
  plans: typeof plans;
  resources: typeof resources;
  schools: typeof schools;
  sync: typeof sync;
  teachers: typeof teachers;
  timetable: typeof timetable;
  work: typeof work;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
