import { trpc } from "@/lib/trpc";
import { computed, ref, watch } from "vue";

type MovementDirection = "in" | "out";
type ReglaOp = "div" | "mul" | "none";

export type MovementWithTags = {
  id: number;
  fecha: string;
  direccion: MovementDirection;
  monto_total: number;
  regla_op: ReglaOp;
  regla_factor: number | null;
  monto_efectivo: number;
  detalle: string;
  observacion: string | null;
  installment_id: number | null;
  source_movement_id: number | null;
  imported_at: string | null;
  source_image_hash: string | null;
  pago_total_propio: boolean | null;
  shares_pendientes: boolean;
  tags: { id: number; kind: string; nombre: string; color: string; activo: boolean }[];
};

export type CreateMovementInput = {
  fecha: string;
  direccion: MovementDirection;
  monto_total: number;
  regla_op?: ReglaOp;
  regla_factor?: number | null;
  detalle: string;
  observacion?: string | null;
  pago_total_propio?: boolean | null;
};

export type UpdateMovementInput = Partial<CreateMovementInput>;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function monthRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${pad(month)}-01`;
  const to = `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`;
  return { from, to };
}

/** Movimientos del mes filtrados por dirección, con alta y refetch. */
export function useMovements(direccion: () => MovementDirection) {
  const now = new Date();
  const year = ref(now.getFullYear());
  const month = ref(now.getMonth() + 1);

  const all = ref<MovementWithTags[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);

  const movements = computed(() => all.value.filter((m) => m.direccion === direccion()));

  async function refetch() {
    loading.value = true;
    error.value = null;
    try {
      const { from, to } = monthRange(year.value, month.value);
      all.value = await trpc.movements.listByDateRange.query({ from, to });
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Error al cargar movimientos";
    } finally {
      loading.value = false;
    }
  }

  async function create(data: CreateMovementInput, tagIds: number[]) {
    await trpc.movements.create.mutate({ data, tagIds });
    await refetch();
  }

  async function update(id: number, data: UpdateMovementInput, tagIds?: number[]) {
    await trpc.movements.update.mutate({ id, data, tagIds });
    await refetch();
  }

  async function remove(id: number) {
    await trpc.movements.delete.mutate({ id });
    await refetch();
  }

  function shiftMonth(delta: number) {
    let m = month.value + delta;
    let y = year.value;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    month.value = m;
    year.value = y;
  }

  watch([year, month], refetch, { immediate: true });

  return { movements, loading, error, year, month, refetch, create, update, remove, shiftMonth };
}

export type MovementShare = {
  id: number;
  movement_id: number;
  persona_tag_id: number | null;
  pagado: boolean;
  fecha_pago: string | null;
};

export async function listMovementShares(movementId: number): Promise<MovementShare[]> {
  return trpc.movements.listShares.query({ movementId });
}

export async function updateMovementShare(
  id: number,
  data: { persona_tag_id?: number | null; pagado?: boolean }
): Promise<MovementShare> {
  return trpc.movements.updateShare.mutate({ id, data });
}
