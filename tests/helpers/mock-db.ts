// =============================================================================
// Mock DB — helper untuk unit test service-layer tanpa database nyata
// =============================================================================
// Service memakai drizzle (`db.select().from().where()...`). Query drizzle
// bersifat thenable — mock ini mengembalikan objek Promise yang juga punya
// method chain. Satu operasi (select/insert/update/delete) = SATU entry di
// `calls`; argumen values/set/where menempel ke entry operasi tsb supaya
// test bisa memeriksa apa yang dieksekusi.
// =============================================================================

export interface MockDbCall {
  kind: "select" | "insert" | "update" | "delete" | "execute";
  table: string;
  values?: unknown;
  set?: unknown;
  where?: unknown;
  sql?: unknown;
}

export interface MockDbOptions {
  selectResults?: unknown[]; // antrian hasil select (FIFO; habis → [])
  returningResults?: unknown[]; // antrian hasil insert/update returning
  executeResults?: unknown[];
}

function tableName(t: unknown): string {
  if (t == null) return "unknown";
  if (typeof t === "string") return t;
  const anyT = t as any;
  // kolom drizzle punya .table → nama tabel
  return String(anyT.table ?? anyT.symbol?.table ?? "unknown");
}

export function createMockDb(opts: MockDbOptions = {}) {
  const calls: MockDbCall[] = [];
  const selectQueue = [...(opts.selectResults ?? [])];
  const returningQueue = [...(opts.returningResults ?? [])];
  const executeQueue = [...(opts.executeResults ?? [])];

  function makeChainable(result: unknown, call: MockDbCall): any {
    const promise: any = new Promise((resolve) => resolve(result));
    for (const m of ["select", "from", "innerJoin", "leftJoin", "where", "orderBy", "limit", "groupBy", "offset", "values", "set", "returning"]) {
      promise[m] = (...args: unknown[]) => {
        if (m === "values") call.values = args[0];
        if (m === "set") call.set = args[0];
        if (m === "where") call.where = args[0];
        // drizzle .returning() resolve ke ARRAY (service mendestruktur [row])
        if (m === "returning") {
          return makeChainable(Array.isArray(result) ? result : result == null ? [] : [result], call);
        }
        return makeChainable(result, call);
      };
    }
    return promise;
  }

  const db: any = {
    calls,
    // antrian hasil — bisa diisi ulang antar test lewat db._selectResults.push(...)
    _selectResults: selectQueue,
    _returningResults: returningQueue,
    _executeResults: executeQueue,
    select: (...args: unknown[]) => {
      const call: MockDbCall = { kind: "select", table: tableName(args[0]) };
      calls.push(call);
      return makeChainable(selectQueue.length > 0 ? selectQueue.shift()! : [], call);
    },
    insert: (table: unknown) => {
      const call: MockDbCall = { kind: "insert", table: tableName(table) };
      calls.push(call);
      return makeChainable(returningQueue.length > 0 ? returningQueue.shift()! : undefined, call);
    },
    update: (table: unknown) => {
      const call: MockDbCall = { kind: "update", table: tableName(table) };
      calls.push(call);
      return makeChainable(returningQueue.length > 0 ? returningQueue.shift()! : undefined, call);
    },
    delete: (table: unknown) => {
      const call: MockDbCall = { kind: "delete", table: tableName(table) };
      calls.push(call);
      return makeChainable(undefined, call);
    },
    execute: (sql: unknown) => {
      calls.push({ kind: "execute", table: "raw", sql });
      return Promise.resolve(executeQueue.length > 0 ? executeQueue.shift()! : []);
    },
    transaction: async (fn: (tx: any) => Promise<unknown>) => fn(db),
  };

  return db;
}
