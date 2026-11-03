<script setup lang="ts">
import { MoreVertical } from "@lucide/vue";
import IconIngreso from "@/components/icons/IconIngreso.vue";
import IconEgreso from "@/components/icons/IconEgreso.vue";
import IconBalance from "@/components/icons/IconBalance.vue";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import MovementFilters from "@/components/movements/MovementFilters.vue";
import MovementForm from "@/components/movements/MovementForm.vue";
import MovementsTable from "@/components/movements/MovementsTable.vue";
import SummaryCard from "@/components/movements/SummaryCard.vue";
import { type MovementWithTags, useMovements } from "@/composables/useMovements";
import { useInfiniteScroll } from "@/composables/useInfiniteScroll";
import { registerSearchContext, searchDetailQuery, unregisterSearchContext } from "@/composables/useSearchContext";
import { trpc } from "@/lib/trpc";

const props = defineProps<{ direccion: "in" | "out" }>();
const route = useRoute();
const router = useRouter();

const { movements, loading, error, year, month, refetch, create, update, remove, shiftMonth } =
  useMovements(() => props.direccion);

const tipos = ref<{ id: number; nombre: string }[]>([]);
const conceptos = ref<{ id: number; nombre: string }[]>([]);
const personas = ref<{ id: number; nombre: string }[]>([]);
const estados = ref<{ id: number; nombre: string }[]>([]);
const tagFilters = ref<{ tipo: number[]; concepto: number[]; persona: number[]; estado: number[] }>(
  { tipo: [], concepto: [], persona: [], estado: [] }
);
const detailQuery = searchDetailQuery;
const formOpen = ref(false);
const editingMovement = ref<MovementWithTags | null>(null);
const deleteCandidateId = ref<number | null>(null);
const templateDialogOpen = ref(false);
const generatingTemplate = ref(false);
const selectedMovementId = ref<number | null>(null);

type SortField = "detalle" | "fecha" | "monto";
type SortDir = "asc" | "desc";
const sortField = ref<SortField>("fecha");
const sortDir = ref<SortDir>("asc");
const sentinelRef = ref<HTMLElement | null>(null);

function toggleSort(field: SortField) {
  if (sortField.value === field) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortField.value = field;
    sortDir.value = field === "monto" ? "desc" : "asc";
  }
}

watch(formOpen, (isOpen) => {
  if (!isOpen) editingMovement.value = null;
});

const summary = ref<{ ingresos: number; egresos: number; balance: number } | null>(null);

async function loadSummary() {
  summary.value = await trpc.movements.summarizeByMonth.query({
    year: year.value,
    month: month.value,
    mode: "proyectado",
  });
}

watch([year, month], loadSummary, { immediate: true });
watch(movements, loadSummary);

function onShiftMonth(delta: number) {
  selectedMovementId.value = null;
  detailQuery.value = "";
  tagFilters.value = { tipo: [], concepto: [], persona: [], estado: [] };
  shiftMonth(delta);
}

function onUpdateTagFilters(v: typeof tagFilters.value) {
  tagFilters.value = v;
  selectedMovementId.value = null;
}

function onUpdateDetailQuery(v: string) {
  detailQuery.value = v;
  selectedMovementId.value = null;
}

const _searchId = registerSearchContext(movements, props.direccion);
onUnmounted(() => unregisterSearchContext(_searchId));

onMounted(async () => {
  const alcanceEsperado: ("general" | "ingreso" | "egreso")[] =
    props.direccion === "out" ? ["general", "egreso"] : ["general", "ingreso"];
  [tipos.value, conceptos.value, personas.value, estados.value] = await Promise.all([
    trpc.tags.listByKind.query({ kind: "tipo", alcance: "general" }),
    trpc.tags.listByKind.query({ kind: "concepto", alcance: alcanceEsperado }),
    trpc.tags.listByKind.query({ kind: "persona", alcance: "general" }),
    trpc.tags.listByKind.query({ kind: "estado", alcance: "general" }),
  ]);
});

watch(
  () => route.query,
  (query) => {
    if (query.nuevo === "1") {
      formOpen.value = true;
      router.replace({ query: {} });
    }
    if (typeof query.q === "string" && query.q) {
      detailQuery.value = query.q;
      router.replace({ query: {} });
    }
    if (typeof query.movementId === "string") {
      if (typeof query.y === "string") year.value = Number(query.y);
      if (typeof query.m === "string") month.value = Number(query.m);
      selectedMovementId.value = Number(query.movementId);
      router.replace({ query: {} });
    }
  },
  { immediate: true }
);

const activeFilterGroups = computed(() =>
  (Object.entries(tagFilters.value) as [keyof typeof tagFilters.value, number[]][]).filter(
    ([, ids]) => ids.length > 0
  )
);

const ESTADO_DESHABILITADO = "Deshabilitado";

function isDeshabilitado(m: MovementWithTags): boolean {
  return m.tags.some((t) => t.kind === "estado" && t.nombre === ESTADO_DESHABILITADO);
}

const hasActiveFilters = computed(
  () => activeFilterGroups.value.length > 0 || detailQuery.value.trim().length > 0
);

const filteredMovements = computed(() => {
  let result = movements.value;
  for (const [, ids] of activeFilterGroups.value) {
    result = result.filter((m) => m.tags.some((t) => ids.includes(t.id)));
  }
  if (detailQuery.value.trim()) {
    const tokens = detailQuery.value.trim().toLowerCase().split(/\s+/);
    result = result.filter((m) => {
      const target = m.detalle.toLowerCase();
      return tokens.every((t) => target.includes(t));
    });
  }
  return result;
});

const filteredTotals = computed(() => {
  const relevant = tagFilters.value.estado.length > 0
    ? filteredMovements.value
    : filteredMovements.value.filter((m) => !isDeshabilitado(m));
  const total = relevant.reduce((acc, m) => acc + m.monto_efectivo, 0);
  return { total, count: relevant.length };
});

const sortedMovements = computed(() => {
  const list = [...filteredMovements.value];
  const dir = sortDir.value === "asc" ? 1 : -1;
  switch (sortField.value) {
    case "detalle":
      return list.sort((a, b) => dir * a.detalle.localeCompare(b.detalle, "es"));
    case "fecha":
      return list.sort((a, b) => dir * a.fecha.localeCompare(b.fecha));
    case "monto":
      return list.sort((a, b) => dir * (a.monto_efectivo - b.monto_efectivo));
  }
});

const { visibleCount } = useInfiniteScroll(sentinelRef, [year, month, tagFilters, detailQuery, sortField, sortDir]);
const visibleMovements = computed(() => sortedMovements.value.slice(0, visibleCount.value));

watch(movements, async () => {
  const id = selectedMovementId.value;
  if (id == null) return;
  const index = sortedMovements.value.findIndex((m) => m.id === id);
  if (index === -1) return;
  if (index >= visibleCount.value) visibleCount.value = index + 1;
  await nextTick();
  document.querySelector(`[data-movement-id="${id}"]`)?.scrollIntoView({ block: "center" });
});

const title = computed(() => (props.direccion === "out" ? "Egresos" : "Ingresos"));

const monthNames = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const previousMonthLabel = computed(() => {
  const m = month.value === 1 ? 12 : month.value - 1;
  return monthNames[m - 1];
});
const currentMonthLabel = computed(() => monthNames[month.value - 1]);

async function onGenerateTemplate() {
  generatingTemplate.value = true;
  try {
    const result = await trpc.templates.generateMonthFromPrevious.mutate({
      year: year.value,
      month: month.value,
    });
    toast.success(
      `Se generaron ${result.created.length} movimientos, ${result.skipped.length} ya existían.`
    );
    templateDialogOpen.value = false;
    await refetch();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Error al generar los movimientos del mes anterior");
  } finally {
    generatingTemplate.value = false;
  }
}

async function onSubmit(
  data: Parameters<typeof create>[0],
  tagIds: number[],
  done: (movementId?: number) => Promise<void>
) {
  try {
    if (editingMovement.value) {
      const id = editingMovement.value.id;
      const installmentId = editingMovement.value.installment_id;
      await update(id, data, tagIds);
      if (installmentId != null) {
        await trpc.debts.syncFromMovement.mutate({ movementId: id });
      }
      await done(id);
      await refetch();
      toast.success("Movimiento actualizado");
    } else {
      await create(data, tagIds);
      await done();
      await refetch();
      toast.success(props.direccion === "out" ? "Egreso creado" : "Ingreso creado");
    }
    formOpen.value = false;
  } catch (e) {
    await done();
    toast.error(e instanceof Error ? e.message : "Error al guardar el movimiento");
  }
}

function onEditRequest(m: MovementWithTags) {
  editingMovement.value = m;
  formOpen.value = true;
}

let pendingDeleteId: number | null = null;

function onDeleteRequest(id: number) {
  pendingDeleteId = id;
  deleteCandidateId.value = id;
}

function onDeleteDialogOpenChange(isOpen: boolean) {
  if (!isOpen) deleteCandidateId.value = null;
}

async function onConfirmDelete() {
  const id = pendingDeleteId;
  if (id == null) return;
  pendingDeleteId = null;
  try {
    await remove(id);
    toast.success("Movimiento eliminado");
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Error al eliminar el movimiento");
  }
}
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <header class="mb-4 flex items-center justify-between">
      <h1 class="text-xl font-bold tracking-tight font-display">{{ title }}</h1>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="icon" aria-label="Más opciones">
            <MoreVertical class="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem @select="templateDialogOpen = true">
            Generar fijos del mes anterior
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>

    <div v-if="error" role="alert" class="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
      {{ error }}
    </div>

    <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <SummaryCard
        label="Ingresos"
        :icon="IconIngreso"
        :value="summary ? summary.ingresos : null"
        tone="pos"
        :subtotal="direccion === 'in' && hasActiveFilters ? filteredTotals.total : undefined"
        :subtotal-count="direccion === 'in' && hasActiveFilters ? filteredTotals.count : undefined"
      />
      <SummaryCard
        label="Egresos"
        :icon="IconEgreso"
        :value="summary ? summary.egresos : null"
        tone="neg"
        :subtotal="direccion === 'out' && hasActiveFilters ? filteredTotals.total : undefined"
        :subtotal-count="direccion === 'out' && hasActiveFilters ? filteredTotals.count : undefined"
      />
      <SummaryCard
        label="Balance"
        :icon="IconBalance"
        :value="summary ? summary.balance : null"
        tone="neutral"
      />
    </div>

    <MovementFilters
      :year="year"
      :month="month"
      :tipos="tipos"
      :conceptos="conceptos"
      :personas="personas"
      :estados="estados"
      :tag-filters="tagFilters"
      :direccion="direccion"
      :detail-query="detailQuery"
      @shift-month="onShiftMonth"
      @update:tag-filters="onUpdateTagFilters"
      @update:detail-query="onUpdateDetailQuery"
      @nuevo="formOpen = true"
    />

    <div class="rounded-xl border border-border bg-card">
      <MovementsTable
        :movements="visibleMovements"
        :loading="loading"
        :sort-field="sortField"
        :sort-dir="sortDir"
        :selected-id="selectedMovementId"
        @edit="onEditRequest"
        @delete-request="onDeleteRequest"
        @sort="toggleSort"
        @changed="refetch"
      />
      <div ref="sentinelRef" class="h-1" aria-hidden="true" />
    </div>

    <p
      v-if="visibleCount < sortedMovements.length"
      class="py-2 text-center text-xs text-muted-foreground"
    >
      Mostrando {{ visibleMovements.length }} de {{ sortedMovements.length }}
    </p>

    <MovementForm
      v-model:open="formOpen"
      :direccion="direccion"
      :movement="editingMovement ?? undefined"
      @submit="onSubmit"
    />

    <AlertDialog :open="deleteCandidateId !== null" @update:open="onDeleteDialogOpenChange">
      <AlertDialogContent class="pointer-events-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar movimiento?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción no se puede deshacer. El movimiento se eliminará permanentemente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction @click="onConfirmDelete">Eliminar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog :open="templateDialogOpen" @update:open="(v) => (templateDialogOpen = v)">
      <AlertDialogContent class="pointer-events-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>¿Generar movimientos fijos del mes anterior?</AlertDialogTitle>
          <AlertDialogDescription>
            Se copiarán los movimientos marcados como Fijo de {{ previousMonthLabel }} a
            {{ currentMonthLabel }}, con fecha actualizada y estado Adeudado. Los que ya existen no
            se duplican; los movimientos actuales del mes no se modifican.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction :disabled="generatingTemplate" @click="onGenerateTemplate">
            Generar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
