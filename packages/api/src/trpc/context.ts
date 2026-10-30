import {
  getDb,
  makeBalanceRepo,
  makeDebtsRepo,
  makeDedupRepo,
  makeInstallmentsRepo,
  makeInvisiblesRepo,
  makeMovementsRepo,
  makeTemplatesRepo,
} from "@mitarasca/core";

/**
 * Context tRPC. El core liga sus repos al `db` singleton (app local single-user),
 * así que instanciamos los factories una sola vez por proceso. Los tags no tienen
 * factory: se consumen vía las funciones de módulo del core directamente en su router.
 */
export function createContext() {
  const db = getDb();
  return {
    movements: makeMovementsRepo(db),
    balance: makeBalanceRepo(db),
    debts: makeDebtsRepo(db),
    installments: makeInstallmentsRepo(db),
    templates: makeTemplatesRepo(db),
    dedup: makeDedupRepo(db),
    invisibles: makeInvisiblesRepo(db),
  };
}

export type Context = ReturnType<typeof createContext>;
