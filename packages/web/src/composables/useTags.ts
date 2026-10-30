import { trpc } from "@/lib/trpc";
import { ref } from "vue";

type TagKind = "tipo" | "concepto" | "estado" | "medio_pago" | "persona";
type TagAlcance = "general" | "ingreso" | "egreso";

export type TagOption = {
  id: number;
  kind: TagKind;
  nombre: string;
  color: string;
  alcance: TagAlcance;
  activo: boolean;
};

/** Listado completo de tags (todos los kind, activos e inactivos), con alta/edición/archivado. */
export function useTags() {
  const items = ref<TagOption[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);

  async function refetch() {
    loading.value = true;
    error.value = null;
    try {
      items.value = await trpc.tags.list.query();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Error al cargar tags";
    } finally {
      loading.value = false;
    }
  }

  async function create(data: {
    kind: TagKind;
    nombre: string;
    color?: string;
    alcance?: TagAlcance;
  }) {
    await trpc.tags.create.mutate(data);
    await refetch();
  }

  async function update(
    id: number,
    data: { nombre?: string; color?: string; alcance?: TagAlcance; activo?: boolean }
  ) {
    await trpc.tags.update.mutate({ id, data });
    await refetch();
  }

  async function archive(id: number) {
    await trpc.tags.deactivate.mutate({ id });
    await refetch();
  }

  refetch();

  return { items, loading, error, refetch, create, update, archive };
}
