// La web importa SOLO el tipo del AppRouter (`import type`), por lo que en runtime
// nada del core (que usa bun:sqlite) entra al bundle. Pero vue-tsc sigue el grafo
// de tipos hasta `bun:sqlite`; este shim lo resuelve para el chequeo de tipos.
// No es un import de valor: no afecta el bundle del navegador.
declare module "bun:sqlite" {
  export class Database {
    constructor(filename?: string);
    // biome-ignore lint/suspicious/noExplicitAny: stub mínimo solo para tipos
    query(sql: string): any;
  }
}

declare const Bun: {
  TOML: {
    parse(text: string): unknown;
  };
  file(path: string): { arrayBuffer(): Promise<ArrayBuffer> };
  // biome-ignore lint/suspicious/noExplicitAny: stub mínimo solo para tipos
  CryptoHasher: new (algorithm: string) => any;
};
