<script setup lang="ts">
import { Eye, EyeOff } from "@lucide/vue";
import { computed, onMounted, ref, watch } from "vue";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import TagsMultiSelect from "@/components/app/TagsMultiSelect.vue";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CreateMovementInput, MovementWithTags } from "@/composables/useMovements";
import { listMovementShares, updateMovementShare } from "@/composables/useMovements";
import { trpc } from "@/lib/trpc";

const props = defineProps<{ open: boolean; direccion: "in" | "out"; movement?: MovementWithTags }>();
const emit = defineEmits<{
  "update:open": [value: boolean];
  submit: [data: CreateMovementInput, tagIds: number[], done: (movementId?: number) => Promise<void>];
}>();

type TagOption = { id: number; nombre: string };

const tipos = ref<TagOption[]>([]);
const conceptos = ref<TagOption[]>([]);
const estados = ref<TagOption[]>([]);
const personas = ref<TagOption[]>([]);
const pagoTotalPropio = ref<boolean>(true);
const shares = ref<{ id?: number; persona_tag_id: number[]; pagado: boolean }[]>([]);
const removedSharesWithData = ref<{ persona_tag_id: number[]; pagado: boolean }[]>([]);

const alcanceEsperado = (): ("general" | "ingreso" | "egreso")[] =>
  props.direccion === "out" ? ["general", "egreso"] : ["general", "ingreso"];

const fecha = ref(new Date().toISOString().slice(0, 10));
const detalle = ref("");
const montoTotal = ref<number | undefined>(undefined);
const reglaOp = ref<"none" | "div" | "mul">("none");
const reglaFactor = ref<number | undefined>(undefined);
const observacion = ref("");
const tipoId = ref<string | undefined>(undefined);
const conceptoIds = ref<number[]>([]);
const estadoId = ref<string | undefined>(undefined);
const personaIds = ref<number[]>([]);

const submitting = ref(false);
const error = ref<string | null>(null);
const confirmSharesLossOpen = ref(false);
const sharesOpen = ref(false);

const showShares = computed(
  () => props.direccion === "out" && reglaOp.value === "div" && (reglaFactor.value ?? 0) > 1
);

onMounted(async () => {
  const [t, c, e, p] = await Promise.all([
    trpc.tags.listByKind.query({ kind: "tipo", soloActivos: true }),
    trpc.tags.listByKind.query({ kind: "concepto", soloActivos: true, alcance: alcanceEsperado() }),
    trpc.tags.listByKind.query({ kind: "estado", soloActivos: true }),
    trpc.tags.listByKind.query({ kind: "persona", soloActivos: true }),
  ]);
  tipos.value = t;
  conceptos.value = c;
  estados.value = e;
  personas.value = p;

  if (props.movement) ensureConceptoOptions(props.movement);
  else if (props.open) applyDefaults();
});

function ensureConceptoOptions(m: MovementWithTags) {
  const conceptoTags = m.tags.filter((tag) => tag.kind === "concepto");
  const missing = conceptoTags.filter(
    (tag) => !conceptos.value.some((opt) => opt.id === tag.id)
  );
  if (missing.length > 0) {
    conceptos.value = [
      ...conceptos.value,
      ...missing.map((tag) => ({ id: tag.id, nombre: tag.nombre })),
    ];
  }
}

function defaultTagId(options: TagOption[], nombre: string): string | undefined {
  const tag = options.find((o) => o.nombre === nombre);
  return tag ? String(tag.id) : undefined;
}

function applyDefaults() {
  tipoId.value = defaultTagId(tipos.value, "Variable");
  const variosTag = conceptos.value.find((o) => o.nombre === "Varios");
  conceptoIds.value = variosTag ? [variosTag.id] : [];
  estadoId.value = defaultTagId(estados.value, "Pagado");
  personaIds.value = [];
}

function reset() {
  fecha.value = new Date().toISOString().slice(0, 10);
  detalle.value = "";
  montoTotal.value = undefined;
  reglaOp.value = "none";
  reglaFactor.value = undefined;
  observacion.value = "";
  error.value = null;
  pagoTotalPropio.value = true;
  shares.value = [];
  removedSharesWithData.value = [];
  applyDefaults();
}

function tagIdFor(m: MovementWithTags, kind: string): string | undefined {
  const tag = m.tags.find((t) => t.kind === kind);
  return tag ? String(tag.id) : undefined;
}

function populate(m: MovementWithTags) {
  shares.value = [];
  removedSharesWithData.value = [];
  fecha.value = m.fecha;
  detalle.value = m.detalle;
  montoTotal.value = m.monto_total;
  reglaOp.value = m.regla_op;
  reglaFactor.value = m.regla_factor ?? undefined;
  observacion.value = m.observacion ?? "";
  tipoId.value = tagIdFor(m, "tipo");
  conceptoIds.value = m.tags.filter((t) => t.kind === "concepto").map((t) => t.id);
  estadoId.value = tagIdFor(m, "estado");
  personaIds.value = m.tags.filter((t) => t.kind === "persona").map((t) => t.id);
  error.value = null;
  pagoTotalPropio.value = m.pago_total_propio ?? true;
  if (m.regla_op === "div" && (m.regla_factor ?? 0) > 1) {
    listMovementShares(m.id).then((loaded) => {
      shares.value = loaded.map((s) => ({
        id: s.id,
        persona_tag_id: s.persona_tag_id ? [s.persona_tag_id] : [],
        pagado: s.pagado,
      }));
    });
  }
  ensureConceptoOptions(m);
}

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    if (props.movement) populate(props.movement);
    else reset();
  }
);

const reglaOpLabel: Record<"none" | "div" | "mul", string> = {
  none: "Sin prorrateo",
  div: "Dividir por",
  mul: "Multiplicar por",
};

/**
 * Registra en removedSharesWithData las shares removidas que tenían datos
 * cargados (persona y/o pago), para advertir al usuario de la pérdida antes
 * de descartarlas de `shares`. El backend deriva la eliminación real de las
 * filas vía `syncMovementShares` a partir del factor, no de esta lista.
 */
function discardShares(removed: typeof shares.value): void {
  removedSharesWithData.value = [
    ...removedSharesWithData.value,
    ...removed.filter((s) => s.persona_tag_id.length > 0 || s.pagado),
  ];
}

watch(reglaFactor, (newFactor) => {
  if (!showShares.value) {
    discardShares(shares.value);
    shares.value = [];
    return;
  }
  const target = Math.round(newFactor ?? 0) - 1;
  if (shares.value.length < target) {
    const toAdd = target - shares.value.length;
    shares.value = [
      ...shares.value,
      ...Array.from({ length: toAdd }, () => ({ persona_tag_id: [], pagado: false })),
    ];
  } else if (shares.value.length > target) {
    const removed = shares.value.slice(target);
    discardShares(removed);
    shares.value = shares.value.slice(0, target);
  }
});

watch(reglaOp, (newOp) => {
  if (newOp !== "div" || (reglaFactor.value ?? 0) <= 1) {
    discardShares(shares.value);
    shares.value = [];
  }
});

/** "2026-08-04T14:22:05.000Z" -> "04/08/2026 14:22:05" */
function formatImportedAt(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function onSubmit() {
  error.value = null;

  if (!detalle.value.trim()) {
    error.value = "El detalle es obligatorio.";
    return;
  }
  if (!montoTotal.value || montoTotal.value <= 0) {
    error.value = "El monto debe ser mayor a 0.";
    return;
  }
  if (!tipoId.value || conceptoIds.value.length === 0 || !estadoId.value) {
    error.value = "Tipo, concepto y estado son obligatorios.";
    return;
  }
  if (reglaOp.value !== "none" && (!reglaFactor.value || reglaFactor.value <= 0)) {
    error.value = "El factor debe ser mayor a 0.";
    return;
  }

  if (removedSharesWithData.value.length > 0) {
    confirmSharesLossOpen.value = true;
    return;
  }

  doSubmit();
}

function onConfirmSharesLoss() {
  confirmSharesLossOpen.value = false;
  doSubmit();
}

async function doSubmit() {
  removedSharesWithData.value = [];

  const data: CreateMovementInput = {
    fecha: fecha.value,
    direccion: props.direccion,
    monto_total: montoTotal.value as number,
    detalle: detalle.value.trim(),
  };
  if (reglaOp.value !== "none") {
    data.regla_op = reglaOp.value;
    data.regla_factor = reglaFactor.value;
  }
  if (observacion.value.trim()) {
    data.observacion = observacion.value.trim();
  }
  if (showShares.value) {
    data.pago_total_propio = pagoTotalPropio.value;
  }

  const sharePersonaIds = shares.value.flatMap((s) => s.persona_tag_id);
  const tagIds = [
    Number(tipoId.value),
    ...conceptoIds.value,
    Number(estadoId.value),
    ...new Set([...personaIds.value, ...sharePersonaIds]),
  ];

  submitting.value = true;
  const localShares = shares.value;
  try {
    await new Promise<void>((resolve, reject) => {
      emit("submit", data, tagIds, (movementId) =>
        persistShares(movementId, localShares).then(resolve, reject)
      );
    });
  } finally {
    submitting.value = false;
  }
}

/**
 * Persiste las shares locales luego de que el submit del padre (create/update)
 * terminó. En edición con shares nuevas (id undefined en el cliente porque el
 * backend recién las crea durante el update), recarga las shares reales por
 * movementId y las empareja por posición con las locales para no perder los
 * datos cargados en filas nuevas.
 */
async function persistShares(
  movementId: number | undefined,
  localShares: typeof shares.value
): Promise<void> {
  if (!movementId || !showShares.value || localShares.length === 0) return;

  const remote = await listMovementShares(movementId);

  await Promise.all(
    localShares.map((s, i) => {
      const targetId = s.id ?? remote[i]?.id;
      if (targetId === undefined) return Promise.resolve();
      return updateMovementShare(targetId, {
        persona_tag_id: s.persona_tag_id[0] ?? null,
        pagado: s.pagado,
      });
    })
  );
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>
          {{ movement ? "Editar movimiento" : direccion === "out" ? "Nuevo egreso" : "Nuevo ingreso" }}
        </DialogTitle>
        <DialogDescription>
          Completá los datos del movimiento. Tipo, concepto y estado son obligatorios. Un
          movimiento Deshabilitado no suma al mes ni puede pagarse desde el pago rápido, pero
          cambiar su estado acá lo rehabilita.
        </DialogDescription>
      </DialogHeader>

      <form class="grid gap-3" @submit.prevent="onSubmit">
        <div class="grid grid-cols-2 gap-3">
          <div class="grid gap-1.5">
            <Label for="mf-fecha">Fecha</Label>
            <Input id="mf-fecha" v-model="fecha" type="date" required />
          </div>
          <div class="grid gap-1.5">
            <Label for="mf-monto">Monto total</Label>
            <Input id="mf-monto" v-model.number="montoTotal" type="number" min="0" step="0.01" class="num" placeholder="0,00" required />
          </div>
        </div>

        <div class="grid gap-1.5">
          <Label for="mf-detalle">Detalle</Label>
          <Input id="mf-detalle" v-model="detalle" placeholder="Alquiler departamento" required />
        </div>

        <div class="grid gap-4">
          <div class="grid grid-cols-2 gap-4">
            <div class="grid gap-1.5">
              <Label for="mf-tipo">Tipo</Label>
              <Select v-model="tipoId">
                <SelectTrigger id="mf-tipo" class="w-full"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="t in tipos" :key="t.id" :value="String(t.id)">{{ t.nombre }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="grid gap-1.5">
              <Label>Concepto</Label>
              <TagsMultiSelect
                v-model="conceptoIds"
                :options="conceptos"
                mode="multiple"
                label="Concepto"
                placeholder="Concepto"
              />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="grid gap-1.5">
              <Label for="mf-estado">Estado</Label>
              <Select v-model="estadoId">
                <SelectTrigger id="mf-estado" class="w-full"><SelectValue placeholder="Estado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="e in estados" :key="e.id" :value="String(e.id)">{{ e.nombre }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="grid gap-1.5">
              <Label>Persona</Label>
              <TagsMultiSelect
                v-model="personaIds"
                :options="personas"
                mode="multiple"
                label="Persona"
                placeholder="Persona (opcional)"
              />
            </div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="grid gap-1.5">
            <Label for="mf-prorrateo">Prorrateo</Label>
            <Select v-model="reglaOp">
              <SelectTrigger id="mf-prorrateo" class="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{{ reglaOpLabel.none }}</SelectItem>
                <SelectItem value="div">{{ reglaOpLabel.div }}</SelectItem>
                <SelectItem value="mul">{{ reglaOpLabel.mul }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="grid gap-1.5">
            <Label for="mf-factor">Factor</Label>
            <Input
              id="mf-factor"
              v-model.number="reglaFactor"
              type="number"
              min="0"
              step="0.01"
              class="num"
              :disabled="reglaOp === 'none'"
              placeholder="2"
            />
          </div>
        </div>

        <Collapsible v-if="showShares" v-model:open="sharesOpen" class="grid gap-2 rounded-md border p-3">
          <div class="flex items-center justify-between">
            <Label>Partes de la división</Label>
            <CollapsibleTrigger as-child>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                :aria-label="sharesOpen ? 'Ocultar partes' : 'Mostrar partes'"
              >
                <EyeOff v-if="sharesOpen" class="size-4" />
                <Eye v-else class="size-4" />
              </Button>
            </CollapsibleTrigger>
          </div>
          <div class="flex items-center gap-2">
            <input id="mf-propio" v-model="pagoTotalPropio" type="checkbox" />
            <Label for="mf-propio" class="text-sm font-normal">Yo pago el total</Label>
          </div>
          <CollapsibleContent>
            <div class="grid max-h-40 gap-2 overflow-y-auto">
              <div v-for="(share, i) in shares" :key="i" class="flex items-center gap-2">
                <TagsMultiSelect
                  v-model="share.persona_tag_id"
                  :options="personas"
                  mode="single"
                  label="Persona"
                  placeholder="Persona (opcional)"
                  class="w-full flex-1"
                />
                <input
                  v-model="share.pagado"
                  type="checkbox"
                  class="shrink-0"
                  title="Ya pago"
                  :aria-label="`Parte ${i + 1} pagada`"
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div class="grid gap-1.5">
          <Label for="mf-obs">Observación</Label>
          <Input id="mf-obs" v-model="observacion" placeholder="Opcional" />
        </div>

        <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>

        <p v-if="props.movement?.imported_at" class="text-muted-foreground text-xs">
          Importado el {{ formatImportedAt(props.movement.imported_at) }}
          <template v-if="props.movement.source_image_hash">
            · origen {{ props.movement.source_image_hash.slice(0, 12) }}
          </template>
        </p>

        <DialogFooter>
          <Button type="button" variant="ghost" @click="emit('update:open', false)">Cancelar</Button>
          <Button type="submit" :disabled="submitting">Guardar</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>

  <AlertDialog :open="confirmSharesLossOpen" @update:open="(v) => (confirmSharesLossOpen = v)">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>¿Eliminar partes con datos cargados?</AlertDialogTitle>
        <AlertDialogDescription>
          Al bajar el factor se eliminarán {{ removedSharesWithData.length }} parte(s) con datos
          cargados (persona y/o pago). ¿Continuar?
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancelar</AlertDialogCancel>
        <AlertDialogAction @click="onConfirmSharesLoss">Aceptar</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
