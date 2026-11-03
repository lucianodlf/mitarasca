<script setup lang="ts">
import { ref, watch } from "vue";
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
import type { TagOption } from "@/composables/useTags";

const props = defineProps<{ open: boolean; tag?: TagOption }>();
const emit = defineEmits<{
  "update:open": [value: boolean];
  submit: [
    data: { kind: "tipo" | "concepto" | "estado" | "medio_pago" | "persona"; nombre: string; color: string; alcance: "general" | "ingreso" | "egreso" },
  ];
}>();

const TAG_KINDS: { value: "tipo" | "concepto" | "estado" | "medio_pago" | "persona"; label: string }[] = [
  { value: "tipo", label: "Tipo" },
  { value: "concepto", label: "Concepto" },
  { value: "estado", label: "Estado" },
  { value: "medio_pago", label: "Medio de pago" },
  { value: "persona", label: "Persona" },
];

const ALCANCES: { value: "general" | "ingreso" | "egreso"; label: string }[] = [
  { value: "general", label: "General" },
  { value: "ingreso", label: "Ingreso" },
  { value: "egreso", label: "Egreso" },
];

const kind = ref<"tipo" | "concepto" | "estado" | "medio_pago" | "persona">("concepto");
const nombre = ref("");
const color = ref("#89a4a7");
const alcance = ref<"general" | "ingreso" | "egreso">("general");
const error = ref<string | null>(null);
const submitting = ref(false);

function reset() {
  kind.value = "concepto";
  nombre.value = "";
  color.value = "#89a4a7";
  alcance.value = "general";
  error.value = null;
}

function populate(t: TagOption) {
  kind.value = t.kind;
  nombre.value = t.nombre;
  color.value = t.color;
  alcance.value = t.alcance;
  error.value = null;
}

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    if (props.tag) populate(props.tag);
    else reset();
  }
);

function onSubmit() {
  error.value = null;
  if (!nombre.value.trim()) {
    error.value = "El nombre es obligatorio.";
    return;
  }
  submitting.value = true;
  try {
    emit("submit", { kind: kind.value, nombre: nombre.value.trim(), color: color.value, alcance: alcance.value });
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ tag ? "Editar tag" : "Nuevo tag" }}</DialogTitle>
        <DialogDescription>
          Completá los datos del tag. El alcance determina dónde aparece disponible al elegir tags en movimientos.
        </DialogDescription>
      </DialogHeader>

      <form class="grid gap-3" @submit.prevent="onSubmit">
        <div class="grid gap-1.5">
          <Label for="tf-tipo-de-tag-kind">Tipo de tag (kind)</Label>
          <Select v-model="kind" :disabled="!!tag">
            <SelectTrigger id="tf-tipo-de-tag-kind" class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="k in TAG_KINDS" :key="k.value" :value="k.value">{{ k.label }}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="grid gap-1.5">
          <Label for="tf-nombre">Nombre</Label>
          <Input
            id="tf-nombre"
            v-model="nombre"
            :disabled="!!tag && tag.kind === 'estado'"
            placeholder="Alquiler"
            required
          />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="grid gap-1.5">
            <Label for="tf-color">Color</Label>
            <Input id="tf-color" v-model="color" type="color" class="h-9 p-1" />
          </div>
          <div class="grid gap-1.5">
            <Label for="tf-alcance">Alcance</Label>
            <Select v-model="alcance">
              <SelectTrigger id="tf-alcance" class="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="a in ALCANCES" :key="a.value" :value="a.value">{{ a.label }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>

        <DialogFooter>
          <Button type="button" variant="ghost" @click="emit('update:open', false)">Cancelar</Button>
          <Button type="submit" :disabled="submitting">Guardar</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
