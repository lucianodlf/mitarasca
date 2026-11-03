<script setup lang="ts">
import { Plus } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

defineProps<{ direccionFilter: "yo_debo" | "me_deben" | null }>();

const emit = defineEmits<{
  "update:direccionFilter": [value: "yo_debo" | "me_deben" | null];
  nuevo: [];
}>();

function onChange(value: unknown) {
  emit("update:direccionFilter", value === "all" ? null : (value as "yo_debo" | "me_deben"));
}
</script>

<template>
  <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
    <Select :model-value="direccionFilter ?? 'all'" @update:model-value="onChange">
      <SelectTrigger class="h-8 w-44 text-sm" aria-label="Filtrar por dirección">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todas</SelectItem>
        <SelectItem value="yo_debo">Yo debo</SelectItem>
        <SelectItem value="me_deben">Me deben</SelectItem>
      </SelectContent>
    </Select>
    <Button size="sm" @click="emit('nuevo')">
      <Plus class="size-4" />
      Nueva deuda
    </Button>
  </div>
</template>
