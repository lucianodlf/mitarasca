<script setup lang="ts">
import { ChevronLeft, ChevronRight } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import IconProyeccion from "@/components/icons/IconProyeccion.vue";

defineProps<{
  year: number;
  mode: "proyectado" | "real";
  includeVariableEstimate: boolean;
}>();

const emit = defineEmits<{
  "shift-year": [delta: number];
  "update:mode": [value: "proyectado" | "real"];
  "update:includeVariableEstimate": [value: boolean];
}>();

function onModeChange(value: unknown) {
  emit("update:mode", value === "real" ? "real" : "proyectado");
}
</script>

<template>
  <div class="mb-3 flex flex-wrap items-center gap-2">
    <div class="flex items-center gap-1 rounded-md border border-border bg-card px-1 py-1">
      <Button variant="ghost" size="icon" class="size-7" aria-label="Año anterior" @click="emit('shift-year', -1)">
        <ChevronLeft class="size-4" />
      </Button>
      <span class="num min-w-16 text-center text-sm">{{ year }}</span>
      <Button variant="ghost" size="icon" class="size-7" aria-label="Año siguiente" @click="emit('shift-year', 1)">
        <ChevronRight class="size-4" />
      </Button>
    </div>

    <Select :model-value="mode" @update:model-value="onModeChange">
      <SelectTrigger class="h-8 w-36 gap-1.5 text-sm" aria-label="Modo de balance">
        <IconProyeccion v-if="mode === 'proyectado'" class="size-3.5 shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="proyectado">Proyectado</SelectItem>
        <SelectItem value="real">Real</SelectItem>
      </SelectContent>
    </Select>

    <span class="flex-1" />

    <Button
      :variant="includeVariableEstimate ? 'default' : 'outline'"
      size="sm"
      class="h-8 text-xs"
      @click="emit('update:includeVariableEstimate', !includeVariableEstimate)"
    >
      Estimar variables en meses sin datos
    </Button>
  </div>
</template>
