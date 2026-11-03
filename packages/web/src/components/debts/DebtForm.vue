<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CreateDebtInput, DebtWithDetail, DeleteDebtOptions } from "@/composables/useDebts";
import { trpc } from "@/lib/trpc";

const props = defineProps<{ open: boolean; debt?: DebtWithDetail }>();
const emit = defineEmits<{
  "update:open": [value: boolean];
  submit: [data: CreateDebtInput, recalcularFechas: boolean, done: () => void];
  delete: [id: number, opts: DeleteDebtOptions];
}>();

type TagOption = { id: number; nombre: string };

const conceptos = ref<TagOption[]>([]);
const mediosPago = ref<TagOption[]>([]);
const personas = ref<TagOption[]>([]);

const descripcion = ref("");
const direccion = ref<"yo_debo" | "me_deben">("yo_debo");
const fecha = ref(new Date().toISOString().slice(0, 10));
const fechaInicio = ref(fecha.value);
const cantCuotas = ref<number | undefined>(1);
const importeTotal = ref<number | undefined>(undefined);
const importeCuota = ref<number | undefined>(undefined);
const ajusteManual = ref<number | undefined>(undefined);
const conceptoId = ref<string | undefined>(undefined);
const medioPagoId = ref<string | undefined>(undefined);
const personaId = ref<string | undefined>(undefined);
const frecuencia = ref<"mensual" | "dias">("mensual");
const frecuenciaDias = ref<number | undefined>(undefined);

const submitting = ref(false);
const error = ref<string | null>(null);
const deleteDialogOpen = ref(false);
const deleteKeepMovements = ref(false);
const deleteDerivadas = ref(false);
const rescheduleDialogOpen = ref(false);
const pendingSubmitData = ref<CreateDebtInput | null>(null);
const rescheduleActionTaken = ref(false);
const importeWarningDialogOpen = ref(false);
const importeWarningActionTaken = ref(false);

onMounted(async () => {
  const [c, mp, p] = await Promise.all([
    trpc.tags.listByKind.query({ kind: "concepto", soloActivos: true }),
    trpc.tags.listByKind.query({ kind: "medio_pago", soloActivos: true }),
    trpc.tags.listByKind.query({ kind: "persona", soloActivos: true }),
  ]);
  conceptos.value = c;
  mediosPago.value = mp;
  personas.value = p;

  if (props.debt) populate(props.debt);
  else preseleccionarConceptoDefault();
});

function preseleccionarConceptoDefault() {
  const varios = conceptos.value.find((c) => c.nombre === "Varios");
  conceptoId.value = varios ? String(varios.id) : undefined;
}

function reset() {
  descripcion.value = "";
  direccion.value = "yo_debo";
  fecha.value = new Date().toISOString().slice(0, 10);
  fechaInicio.value = fecha.value;
  cantCuotas.value = 1;
  importeTotal.value = undefined;
  importeCuota.value = undefined;
  ajusteManual.value = undefined;
  medioPagoId.value = undefined;
  personaId.value = undefined;
  frecuencia.value = "mensual";
  frecuenciaDias.value = undefined;
  error.value = null;
  preseleccionarConceptoDefault();
}

function populate(d: DebtWithDetail) {
  descripcion.value = d.descripcion;
  direccion.value = d.direccion;
  fecha.value = d.fecha;
  fechaInicio.value = d.fecha_inicio;
  cantCuotas.value = d.cant_cuotas;
  importeTotal.value = d.importe_total;
  importeCuota.value = d.cant_cuotas > 0 ? round2(d.importe_total / d.cant_cuotas) : undefined;
  ajusteManual.value = d.ajuste_manual || undefined;
  conceptoId.value = d.concepto_tag_id != null ? String(d.concepto_tag_id) : undefined;
  medioPagoId.value = d.medio_pago_tag_id != null ? String(d.medio_pago_tag_id) : undefined;
  personaId.value = d.persona_tag_id != null ? String(d.persona_tag_id) : undefined;
  frecuencia.value = d.frecuencia;
  frecuenciaDias.value = d.frecuencia_dias ?? undefined;
  error.value = null;
}

watch(fecha, (nuevaFecha) => {
  if (!props.debt) fechaInicio.value = nuevaFecha;
});

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    submitting.value = false;
    deleteKeepMovements.value = false;
    deleteDerivadas.value = false;
    if (props.debt) populate(props.debt);
    else reset();
  }
);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function importeOCuotasCambiaron(): boolean {
  if (!props.debt) return false;
  return cantCuotas.value !== props.debt.cant_cuotas || importeTotal.value !== props.debt.importe_total;
}

function onChangeCantCuotasOrTotal() {
  if (!cantCuotas.value || cantCuotas.value <= 0 || importeTotal.value == null) return;
  importeCuota.value = round2(importeTotal.value / cantCuotas.value);
}

function onChangeImporteCuota() {
  if (!cantCuotas.value || cantCuotas.value <= 0 || importeCuota.value == null) return;
  importeTotal.value = round2(importeCuota.value * cantCuotas.value);
}

function buildSubmitData(): CreateDebtInput {
  const data: CreateDebtInput = {
    descripcion: descripcion.value.trim(),
    direccion: direccion.value,
    importe_total: importeTotal.value as number,
    cant_cuotas: cantCuotas.value as number,
    fecha: fecha.value,
    fecha_inicio: fechaInicio.value,
    frecuencia: frecuencia.value,
    frecuencia_dias: frecuencia.value === "dias" ? frecuenciaDias.value : null,
    concepto_tag_id: conceptoId.value != null ? Number(conceptoId.value) : null,
    medio_pago_tag_id: medioPagoId.value != null ? Number(medioPagoId.value) : null,
    persona_tag_id: personaId.value != null ? Number(personaId.value) : null,
  };
  if (ajusteManual.value != null) {
    data.ajuste_manual = ajusteManual.value;
  }
  return data;
}

function doEmitSubmit(data: CreateDebtInput, recalcularFechas: boolean) {
  submitting.value = true;
  emit("submit", data, recalcularFechas, () => {
    submitting.value = false;
  });
}

async function onSubmit() {
  error.value = null;

  if (!descripcion.value.trim()) {
    error.value = "La descripción es obligatoria.";
    return;
  }
  if (!importeTotal.value || importeTotal.value <= 0) {
    error.value = "El importe total debe ser mayor a 0.";
    return;
  }
  if (!cantCuotas.value || cantCuotas.value <= 0) {
    error.value = "La cantidad de cuotas debe ser mayor a 0.";
    return;
  }
  if (frecuencia.value === "dias" && (!frecuenciaDias.value || frecuenciaDias.value <= 0)) {
    error.value = "Indicá la cantidad de días entre cuotas.";
    return;
  }

  const data = buildSubmitData();

  if (importeOCuotasCambiaron()) {
    pendingSubmitData.value = data;
    importeWarningActionTaken.value = false;
    importeWarningDialogOpen.value = true;
    return;
  }

  proceedAfterImporteWarning(data);
}

function proceedAfterImporteWarning(data: CreateDebtInput) {
  const fechaInicioCambio = props.debt != null && fechaInicio.value !== props.debt.fecha_inicio;
  if (fechaInicioCambio) {
    pendingSubmitData.value = data;
    rescheduleActionTaken.value = false;
    rescheduleDialogOpen.value = true;
    return;
  }

  doEmitSubmit(data, false);
}

function onConfirmImporteWarning() {
  if (!pendingSubmitData.value) return;
  importeWarningActionTaken.value = true;
  importeWarningDialogOpen.value = false;
  const data = pendingSubmitData.value;
  pendingSubmitData.value = null;
  proceedAfterImporteWarning(data);
}

function onCancelImporteWarning() {
  importeWarningDialogOpen.value = false;
  // Mismo cuidado de orden de eventos que en onCancelReschedule: esperar un tick para no pisar
  // pendingSubmitData si en realidad hubo una confirmación real.
  nextTick(() => {
    if (importeWarningActionTaken.value) return;
    pendingSubmitData.value = null;
  });
}

function onConfirmReschedule() {
  if (!pendingSubmitData.value) return;
  rescheduleActionTaken.value = true;
  rescheduleDialogOpen.value = false;
  doEmitSubmit(pendingSubmitData.value, true);
  pendingSubmitData.value = null;
}

function onSkipReschedule() {
  if (!pendingSubmitData.value) return;
  rescheduleActionTaken.value = true;
  rescheduleDialogOpen.value = false;
  doEmitSubmit(pendingSubmitData.value, false);
  pendingSubmitData.value = null;
}

function onCancelReschedule() {
  rescheduleDialogOpen.value = false;
  // AlertDialogAction/AlertDialogCancel cierran el diálogo (emiten update:open) ANTES de que
  // corra su propio @click en el DOM, así que este handler puede dispararse antes de que
  // onConfirmReschedule/onSkipReschedule marquen rescheduleActionTaken. Se espera un tick para
  // no pisar pendingSubmitData si en realidad hubo una acción real.
  nextTick(() => {
    if (rescheduleActionTaken.value) return;
    pendingSubmitData.value = null;
  });
}

function onConfirmDelete() {
  if (!props.debt) return;
  deleteDialogOpen.value = false;
  emit("delete", props.debt.id, {
    deleteMovements: !deleteKeepMovements.value,
    deleteDerived: deleteDerivadas.value,
  });
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ debt ? "Editar deuda" : "Nueva deuda" }}</DialogTitle>
        <DialogDescription>
          Completá los datos de la deuda. Se generarán las cuotas automáticamente.
        </DialogDescription>
      </DialogHeader>

      <form class="grid gap-3" @submit.prevent="onSubmit">
        <div class="grid gap-1.5">
          <Label for="df-descripcion">Descripción</Label>
          <Input id="df-descripcion" v-model="descripcion" placeholder="Préstamo auto" required />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="grid gap-1.5">
            <Label for="df-direccion">Dirección</Label>
            <Select v-model="direccion">
              <SelectTrigger id="df-direccion" class="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="yo_debo">Yo debo</SelectItem>
                <SelectItem value="me_deben">Me deben</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="grid gap-1.5">
            <Label for="df-fecha">Fecha</Label>
            <Input id="df-fecha" v-model="fecha" type="date" required />
          </div>
        </div>

        <div class="grid grid-cols-3 gap-3">
          <div class="grid gap-1.5">
            <Label for="df-cuotas">Cant. cuotas</Label>
            <Input
              id="df-cuotas"
              v-model.number="cantCuotas"
              type="number"
              min="1"
              step="1"
              class="num"
              required
              @update:model-value="onChangeCantCuotasOrTotal"
            />
          </div>
          <div class="grid gap-1.5">
            <Label for="df-total">Importe total</Label>
            <Input
              id="df-total"
              v-model.number="importeTotal"
              type="number"
              min="0"
              step="0.01"
              class="num"
              placeholder="0,00"
              required
              @update:model-value="onChangeCantCuotasOrTotal"
            />
          </div>
          <div class="grid gap-1.5">
            <Label for="df-cuota">Importe cuota</Label>
            <Input
              id="df-cuota"
              v-model.number="importeCuota"
              type="number"
              min="0"
              step="0.01"
              class="num"
              placeholder="0,00"
              @update:model-value="onChangeImporteCuota"
            />
          </div>
        </div>

        <p v-if="importeOCuotasCambiaron()" class="text-sm text-muted-foreground">
          Modificar la cantidad de cuotas o el importe recalcula todas las cuotas — incluidas las
          ya pagadas — y sus movimientos vinculados.
        </p>

        <div class="grid grid-cols-[1fr_1fr_auto] gap-3">
          <div class="grid gap-1.5">
            <Label for="df-fecha-inicio">Fecha primera cuota</Label>
            <Input id="df-fecha-inicio" v-model="fechaInicio" type="date" required />
          </div>
          <div class="grid gap-1.5">
            <Label for="df-frecuencia">Frecuencia</Label>
            <Select v-model="frecuencia">
              <SelectTrigger id="df-frecuencia" class="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mensual">Mensual</SelectItem>
                <SelectItem value="dias">Cada N días</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div v-if="frecuencia === 'dias'" class="grid gap-1.5">
            <Label for="df-frecuencia-dias">Días entre cuotas</Label>
            <Input
              id="df-frecuencia-dias"
              v-model.number="frecuenciaDias"
              type="number"
              min="1"
              step="1"
              class="num w-20"
              placeholder="30"
            />
          </div>
        </div>

        <div class="grid gap-1.5">
          <Label for="df-ajuste">Ajuste manual</Label>
          <Input id="df-ajuste" v-model.number="ajusteManual" type="number" step="0.01" class="num" placeholder="0,00" />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="grid gap-1.5">
            <Label for="df-concepto">Concepto</Label>
            <Select v-model="conceptoId">
              <SelectTrigger id="df-concepto" class="w-full"><SelectValue placeholder="Concepto" /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="c in conceptos" :key="c.id" :value="String(c.id)">{{ c.nombre }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="grid gap-1.5">
            <Label for="df-medio-de-pago">Medio de pago</Label>
            <Select v-model="medioPagoId">
              <SelectTrigger id="df-medio-de-pago" class="w-full"><SelectValue placeholder="Medio de pago" /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="mp in mediosPago" :key="mp.id" :value="String(mp.id)">{{ mp.nombre }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div class="grid gap-1.5">
          <Label for="df-persona-entidad">Persona/Entidad</Label>
          <Select v-model="personaId">
            <SelectTrigger id="df-persona-entidad" class="w-full"><SelectValue placeholder="Sin persona" /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="p in personas" :key="p.id" :value="String(p.id)">{{ p.nombre }}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>

        <DialogFooter class="justify-between sm:justify-between">
          <Button
            v-if="debt"
            type="button"
            variant="ghost"
            class="text-destructive hover:text-destructive"
            @click="deleteDialogOpen = true"
          >
            Eliminar
          </Button>
          <div class="flex gap-2">
            <Button type="button" variant="ghost" @click="emit('update:open', false)">Cancelar</Button>
            <Button type="submit" :disabled="submitting">Guardar</Button>
          </div>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>

  <AlertDialog :open="deleteDialogOpen" @update:open="(v) => (deleteDialogOpen = v)">
    <AlertDialogContent class="pointer-events-auto">
      <AlertDialogHeader>
        <AlertDialogTitle>¿Eliminar deuda?</AlertDialogTitle>
        <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
      </AlertDialogHeader>
      <div class="grid gap-2 text-sm">
        <label class="flex items-center gap-2">
          <input v-model="deleteKeepMovements" type="checkbox" class="size-4" />
          Conservar los movimientos vinculados (se desvinculan en vez de borrarse)
        </label>
        <label v-if="debt && debt.derivadas_count > 0" class="flex items-center gap-2">
          <input v-model="deleteDerivadas" type="checkbox" class="size-4" />
          Eliminar también sus {{ debt.derivadas_count }} deuda(s) derivada(s)
        </label>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancelar</AlertDialogCancel>
        <AlertDialogAction @click="onConfirmDelete">Eliminar</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <AlertDialog :open="importeWarningDialogOpen" @update:open="onCancelImporteWarning">
    <AlertDialogContent class="pointer-events-auto">
      <AlertDialogHeader>
        <AlertDialogTitle>¿Sobrescribir el importe de las cuotas?</AlertDialogTitle>
        <AlertDialogDescription>
          Cambiaste la cantidad de cuotas o el importe total. Se va a sobrescribir el importe de
          todas las cuotas —pagadas y pendientes— y de sus movimientos vinculados, sin importar su
          estado. Esta acción no se puede deshacer.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="onCancelImporteWarning">Cancelar</AlertDialogCancel>
        <AlertDialogAction @click="onConfirmImporteWarning">Confirmar</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <AlertDialog :open="rescheduleDialogOpen" @update:open="onCancelReschedule">
    <AlertDialogContent class="pointer-events-auto">
      <AlertDialogHeader>
        <AlertDialogTitle>¿Recalcular las fechas de las cuotas?</AlertDialogTitle>
        <AlertDialogDescription>
          Moviste la primera cuota del {{ debt?.fecha_inicio }} al {{ fechaInicio }}. Podés
          recalcular las fechas de las {{ debt?.cant_cuotas }} cuotas en cadena, respetando la
          frecuencia {{ frecuencia === "mensual" ? "mensual" : `cada ${frecuenciaDias} días` }}.
          Los importes y observaciones de cada cuota se conservan. Se incluyen también las cuotas
          ya pagadas: su fecha y la del movimiento vinculado se actualizan al valor calculado.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="onCancelReschedule">Cancelar</AlertDialogCancel>
        <Button type="button" variant="outline" @click="onSkipReschedule">
          Guardar sin recalcular
        </Button>
        <AlertDialogAction @click="onConfirmReschedule">Recalcular las fechas</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
