/**
 * Doble de prueba de Supabase.
 * Encadena como el cliente real (`from().select().eq().single()`) pero devuelve
 * una respuesta preparada y anota las llamadas, para poder afirmar que un
 * servicio filtró por lo que debía.
 */

export interface StubError {
  message: string;
  code?: string;
}

export interface StubResponse<T> {
  data: T | null;
  error: StubError | null;
}

export interface RecordedCall {
  method: string;
  args: readonly unknown[];
}

export function ok<T>(data: T): StubResponse<T> {
  return { data, error: null };
}

export function fail(message: string, code?: string): StubResponse<never> {
  return { data: null, error: { message, code } };
}

export class QueryStub<T> implements PromiseLike<StubResponse<T>> {
  readonly calls: RecordedCall[] = [];

  constructor(private readonly response: StubResponse<T>) {}

  private record(method: string, args: readonly unknown[]): this {
    this.calls.push({ method, args });
    return this;
  }

  select = (...args: unknown[]) => this.record("select", args);
  insert = (...args: unknown[]) => this.record("insert", args);
  upsert = (...args: unknown[]) => this.record("upsert", args);
  update = (...args: unknown[]) => this.record("update", args);
  delete = (...args: unknown[]) => this.record("delete", args);
  eq = (...args: unknown[]) => this.record("eq", args);
  neq = (...args: unknown[]) => this.record("neq", args);
  in = (...args: unknown[]) => this.record("in", args);
  is = (...args: unknown[]) => this.record("is", args);
  gt = (...args: unknown[]) => this.record("gt", args);
  gte = (...args: unknown[]) => this.record("gte", args);
  lt = (...args: unknown[]) => this.record("lt", args);
  lte = (...args: unknown[]) => this.record("lte", args);
  or = (...args: unknown[]) => this.record("or", args);
  not = (...args: unknown[]) => this.record("not", args);
  order = (...args: unknown[]) => this.record("order", args);
  limit = (...args: unknown[]) => this.record("limit", args);
  single = (...args: unknown[]) => this.record("single", args);
  maybeSingle = (...args: unknown[]) => this.record("maybeSingle", args);
  /** El cliente real usa `returns<T>()` para tipar selects anidados. */
  returns = <R>(): QueryStub<R> => this as unknown as QueryStub<R>;

  then<R1 = StubResponse<T>, R2 = never>(
    onfulfilled?: ((value: StubResponse<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.response).then(onfulfilled, onrejected);
  }

  /** Argumentos de la primera llamada al método indicado. */
  argsOf(method: string): readonly unknown[] | undefined {
    return this.calls.find((call) => call.method === method)?.args;
  }
}

export interface SupabaseStubConfig {
  /** Respuesta por tabla. Si falta una tabla, se devuelve `null` sin error. */
  tables?: Record<string, StubResponse<unknown>>;
  /** Respuesta por función RPC. */
  rpc?: Record<string, StubResponse<unknown>>;
}

export class SupabaseStub {
  readonly queries: Record<string, QueryStub<unknown>[]> = {};
  readonly rpcCalls: RecordedCall[] = [];

  constructor(private readonly config: SupabaseStubConfig = {}) {}

  from(table: string): QueryStub<unknown> {
    const response = this.config.tables?.[table] ?? { data: null, error: null };
    const query = new QueryStub(response);
    (this.queries[table] ??= []).push(query);
    return query;
  }

  rpc(name: string, args?: unknown): QueryStub<unknown> {
    this.rpcCalls.push({ method: name, args: [args] });
    return new QueryStub(this.config.rpc?.[name] ?? { data: null, error: null });
  }

  /** Primera consulta lanzada contra una tabla, para inspeccionar filtros. */
  queryFor(table: string): QueryStub<unknown> | undefined {
    return this.queries[table]?.[0];
  }
}

/**
 * El stub no implementa la superficie completa de `SupabaseClient`, así que
 * se entrega a los servicios a través de esta conversión, en un único sitio.
 */
export function asClient<T>(stub: SupabaseStub): T {
  return stub as unknown as T;
}
