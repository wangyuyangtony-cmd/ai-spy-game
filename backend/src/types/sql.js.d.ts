declare module 'sql.js' {
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
  }

  interface Database {
    run(sql: string, params?: any[]): Database;
    exec(sql: string, params?: any[]): QueryExecResult[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  interface Statement {
    bind(params?: any[] | Record<string, any>): boolean;
    step(): boolean;
    get(params?: any[]): any[];
    getAsObject(params?: any[]): Record<string, any>;
    free(): boolean;
    reset(): void;
    getColumnNames(): string[];
  }

  interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  interface SqlJsInitOptions {
    locateFile?: (filename: string) => string;
  }

  function initSqlJs(options?: SqlJsInitOptions): Promise<SqlJsStatic>;
  export default initSqlJs;
  export { Database, Statement, QueryExecResult, SqlJsStatic };
}
