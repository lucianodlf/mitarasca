<script setup lang="ts">
import { ref, watch } from "vue";
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
import { Switch } from "@/components/ui/switch";
import { formatMoney } from "@/lib/format";
import type { Installment } from "./InstallmentsList.vue";

const props = defineProps<{ open: boolean; installment: Installment | null }>();
const emit = defineEmits<{
  "update:open": [value: boolean];
  save: [
    installment: Installment,
    data: { fecha_prevista: string; importe: number; estado: "pendiente" | "pagada" },
    propagarAMovimiento: boolean,
  ];
}>();

const fecha = ref("");
const importe = ref<number | undefined>(undefined);
const pagada = ref(false);
const error = ref<string | null>(null);

const importeWarningOpen = ref(false);
const propagarAMovimiento = ref(true);

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen || !props.installment) return;
    fecha.value = props.installment.fecha_prevista;
    importe.value = props.installment.importe;
    pagada.value = props.installment.estado === "pagada";
    error.value = null;
  }
);

function doEmitSave() {
  if (!props.installment) return;
  emit(
    "save",
    props.installment,
    {
      fecha_prevista: fecha.value,
      importe: importe.value as number,
      estado: pagada.value ? "pagada" : "pendiente",
    },
    propagarAMovimiento.value
  );
}

function onSubmit() {
  error.value = null;
  if (!fecha.value) {
    error.value = "La fecha es obligatoria.";
    return;
  }
  if (!importe.value || importe.value <= 0) {
    error.value = "El importe debe ser mayor a 0.";
    return;
  }

  const importeCambio = props.installment != null && importe.value !== props.installment.importe;
  if (importeCambio) {
    propagarAMovimiento.value = true;
    importeWarningOpen.value = true;
    return;
  }

  doEmitSave();
}

function onConfirmImporteWarning() {
  importeWarningOpen.value = false;
  doEmitSave();
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>Editar cuota {{ installment?.nro }}</DialogTitle>
        <DialogDescription>Modificá la fecha, el importe o el estado de la cuota.</DialogDescription>
      </DialogHeader>

      <form class="grid gap-3" @submit.prevent="onSubmit">
        <div class="grid gap-1.5">
          <Label for="iem-fecha">Fecha</Label>
          <Input id="iem-fecha" v-model="fecha" type="date" required />
        </div>

        <div class="grid gap-1.5">
          <Label for="iem-importe">Importe</Label>
          <Input
            id="iem-importe"
            v-model.number="importe"
            type="number"
            min="0"
            step="0.01"
            class="num"
            placeholder="0,00"
            required
          />
        </div>

        <div class="flex items-center justify-between">
          <Label for="iem-estado">Pagada</Label>
          <Switch id="iem-estado" v-model="pagada" />
        </div>

        <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>

        <DialogFooter>
          <Button type="button" variant="ghost" @click="emit('update:open', false)">Cancelar</Button>
          <Button type="submit">Guardar</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>

  <AlertDialog :open="importeWarningOpen" @update:open="(v) => (importeWarningOpen = v)">
    <AlertDialogContent class="pointer-events-auto">
      <AlertDialogHeader>
        <AlertDialogTitle>¿Actualizar importe de la cuota?</AlertDialogTitle>
        <AlertDialogDescription>
          <template v-if="installment?.estado === 'pagada'">
            Esta cuota ya está marcada como pagada. ¿Confirmás el cambio de importe a
            {{ formatMoney(importe ?? 0) }}?
          </template>
          <template v-else>
            Se actualizará el importe de la cuota a {{ formatMoney(importe ?? 0) }}.
          </template>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div v-if="installment?.movement_id != null" class="grid gap-2 text-sm">
        <label class="flex items-center gap-2">
          <input v-model="propagarAMovimiento" type="checkbox" class="size-4" />
          Actualizar también el movimiento vinculado
        </label>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancelar</AlertDialogCancel>
        <AlertDialogAction @click="onConfirmImporteWarning">Confirmar</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
