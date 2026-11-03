<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
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
import type { DebtWithDetail, ShareSplit } from "@/composables/useDebts";
import { trpc } from "@/lib/trpc";

const props = defineProps<{ open: boolean; debt?: DebtWithDetail }>();
const emit = defineEmits<{
  "update:open": [value: boolean];
  submit: [splits: ShareSplit[], done: () => void];
}>();

type TagOption = { id: number; nombre: string };
type Modo = "importe" | "porcentaje";

type Row = {
  personaId: string | undefined;
  modo: Modo;
  valor: number | undefined;
  medioPagoId: string | undefined;
};

const personas = ref<TagOption[]>([]);
const mediosPago = ref<TagOption[]>([]);
const rows = ref<Row[]>([{ personaId: undefined, modo: "porcentaje", valor: 50, medioPagoId: undefined }]);
const submitting = ref(false);
const error = ref<string | null>(null);

onMounted(async () => {
  const [p, mp] = await Promise.all([
    trpc.tags.listByKind.query({ kind: "persona", soloActivos: true }),
    trpc.tags.listByKind.query({ kind: "medio_pago", soloActivos: true }),
  ]);
  personas.value = p;
  mediosPago.value = mp;
});

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    submitting.value = false;
    error.value = null;
    rows.value = [{ personaId: undefined, modo: "porcentaje", valor: 50, medioPagoId: undefined }];
  }
);

function addRow() {
  rows.value.push({ personaId: undefined, modo: "porcentaje", valor: 50, medioPagoId: undefined });
}

function removeRow(index: number) {
  rows.value.splice(index, 1);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function importeAsignado(row: Row): number {
  if (row.valor == null || !props.debt) return 0;
  return row.modo === "importe" ? row.valor : round2((row.valor / 100) * props.debt.importe_total);
}

function sumaAsignada(): number {
  return round2(rows.value.reduce((acc, r) => acc + importeAsignado(r), 0));
}

function excedeTotal(): boolean {
  if (!props.debt) return false;
  return sumaAsignada() > props.debt.importe_total + 0.01;
}

async function onSubmit() {
  error.value = null;
  if (!props.debt) return;

  if (rows.value.some((r) => r.personaId == null)) {
    error.value = "Seleccioná una persona en cada fila.";
    return;
  }
  if (rows.value.some((r) => !r.valor || r.valor <= 0)) {
    error.value = "Cada fila necesita un importe o porcentaje mayor a 0.";
    return;
  }
  const personaIds = rows.value.map((r) => r.personaId);
  if (new Set(personaIds).size !== personaIds.length) {
    error.value = "No repitas la misma persona en más de una fila.";
    return;
  }
  if (excedeTotal()) {
    error.value = `La suma asignada (${sumaAsignada()}) excede el importe total de la deuda (${props.debt.importe_total}).`;
    return;
  }

  const splits: ShareSplit[] = rows.value.map((r) => ({
    persona_tag_id: Number(r.personaId),
    ...(r.modo === "importe" ? { importe: r.valor } : { porcentaje: r.valor }),
    medio_pago_tag_id: r.medioPagoId != null ? Number(r.medioPagoId) : null,
  }));

  submitting.value = true;
  emit("submit", splits, () => {
    submitting.value = false;
  });
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Compartir deuda</DialogTitle>
        <DialogDescription>
          Generá deudas derivadas (me deben) por persona a partir de "{{ debt?.descripcion }}".
        </DialogDescription>
      </DialogHeader>

      <form class="grid gap-3" @submit.prevent="onSubmit">
        <div v-for="(row, i) in rows" :key="i" class="grid grid-cols-[1fr_1fr_auto] items-end gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
          <div class="col-span-3 grid gap-1.5 sm:col-span-1">
            <Label :for="`sd-persona-${i}`">Persona/Entidad</Label>
            <Select v-model="row.personaId">
              <SelectTrigger :id="`sd-persona-${i}`" class="w-full"><SelectValue placeholder="Persona" /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="p in personas" :key="p.id" :value="String(p.id)">{{ p.nombre }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="grid gap-1.5">
            <Label :for="`sd-modo-${i}`">Modo</Label>
            <Select v-model="row.modo">
              <SelectTrigger :id="`sd-modo-${i}`" class="w-full sm:w-[110px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="importe">Importe</SelectItem>
                <SelectItem value="porcentaje">%</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="grid gap-1.5">
            <Label :for="`sd-valor-${i}`">Valor</Label>
            <Input :id="`sd-valor-${i}`" v-model.number="row.valor" type="number" min="0" step="0.01" class="num w-full sm:w-[100px]" />
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Quitar persona" @click="removeRow(i)">×</Button>
        </div>

        <Button type="button" variant="outline" size="sm" class="justify-self-start" @click="addRow">
          + Agregar persona
        </Button>

        <div class="flex items-center justify-between text-sm text-muted-foreground">
          <span>Asignado: {{ sumaAsignada() }} / {{ debt?.importe_total }}</span>
          <span v-if="excedeTotal()" role="alert" class="text-destructive">Excede el importe total</span>
        </div>

        <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>

        <DialogFooter>
          <Button type="button" variant="ghost" @click="emit('update:open', false)">Cancelar</Button>
          <Button type="submit" :disabled="submitting || excedeTotal()">Compartir</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
