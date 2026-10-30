import { readonly, ref, watch } from "vue";
import type { Ref } from "vue";
import type { MovementWithTags } from "./useMovements";

// Singletons a nivel de módulo — solo un MovementsView activo a la vez.
const _movements = ref<MovementWithTags[]>([]);
const _direction = ref<"in" | "out" | null>(null);

/** Compartido entre CommandPalette (escribe) y MovementsView (lee/escribe). */
export const searchDetailQuery = ref("");

let _stopWatch: (() => void) | null = null;
let _currentId: symbol | null = null;

/**
 * Registra el MovementsView activo como proveedor de datos de búsqueda.
 * Devuelve un id que debe pasarse a `unregisterSearchContext` en onUnmounted.
 */
export function registerSearchContext(
  movementsRef: Ref<MovementWithTags[]>,
  direction: "in" | "out"
): symbol {
  const id = Symbol();
  _currentId = id;
  if (_stopWatch) {
    _stopWatch();
    _stopWatch = null;
  }
  _stopWatch = watch(
    movementsRef,
    (v) => {
      _movements.value = v;
    },
    { immediate: true }
  );
  _direction.value = direction;
  return id;
}

/**
 * El MovementsView se desmonta. Solo limpia si sigue siendo el owner actual
 * (evita borrar una registración más nueva durante la transición de rutas).
 */
export function unregisterSearchContext(id: symbol): void {
  if (_currentId !== id) return;
  if (_stopWatch) {
    _stopWatch();
    _stopWatch = null;
  }
  _movements.value = [];
  _direction.value = null;
  searchDetailQuery.value = "";
  _currentId = null;
}

/** Acceso de solo lectura al estado de búsqueda (para CommandPalette). */
export function useSearchContext() {
  return {
    movements: readonly(_movements) as Readonly<Ref<MovementWithTags[]>>,
    direction: readonly(_direction) as Readonly<Ref<"in" | "out" | null>>,
  };
}
