<script setup lang="ts">
import { Search, X, ChevronLeft, ChevronRight, Plus, Eraser } from "@lucide/vue";
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import TagsMultiSelect from "@/components/app/TagsMultiSelect.vue";

type TagOption = { id: number; nombre: string; color?: string };

export type TagFilters = {
  tipo: number[];
  concepto: number[];
  persona: number[];
  estado: number[];
};

const props = defineProps<{
  year: number;
  month: number;
  tipos: TagOption[];
  conceptos: TagOption[];
  personas: TagOption[];
  estados: TagOption[];
  tagFilters: TagFilters;
  direccion: "in" | "out";
  detailQuery: string;
}>();

const emit = defineEmits<{
  "shift-month": [delta: number];
  "update:tagFilters": [value: TagFilters];
  "update:detailQuery": [value: string];
  nuevo: [];
}>();

const monthLabel = (year: number, month: number) =>
  new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(
    new Date(year, month - 1, 1)
  );

function updateGroup(group: keyof TagFilters, ids: number[]) {
  emit("update:tagFilters", { ...props.tagFilters, [group]: ids });
}

const hasActiveFilters = computed(
  () =>
    props.tagFilters.tipo.length > 0 ||
    props.tagFilters.concepto.length > 0 ||
    props.tagFilters.persona.length > 0 ||
    props.tagFilters.estado.length > 0 ||
    props.detailQuery.trim().length > 0
);

function clearFilters() {
  emit("update:tagFilters", { tipo: [], concepto: [], persona: [], estado: [] });
  emit("update:detailQuery", "");
}
</script>

<template>
  <div class="mb-3 flex flex-col gap-2">
    <div class="flex items-center gap-2">
      <div class="flex items-center gap-1 rounded-md border border-border bg-card px-1 py-1">
        <Button variant="ghost" size="icon" class="size-7" aria-label="Mes anterior" @click="emit('shift-month', -1)">
          <ChevronLeft class="size-4" />
        </Button>
        <span class="min-w-32 text-center text-sm capitalize">{{ monthLabel(year, month) }}</span>
        <Button variant="ghost" size="icon" class="size-7" aria-label="Mes siguiente" @click="emit('shift-month', 1)">
          <ChevronRight class="size-4" />
        </Button>
      </div>

      <span class="flex-1" />

      <Button
        size="icon"
        class="size-8 bg-cta text-cta-foreground hover:opacity-90"
        :aria-label="direccion === 'out' ? 'Nuevo egreso' : 'Nuevo ingreso'"
        :title="direccion === 'out' ? 'Nuevo egreso' : 'Nuevo ingreso'"
        @click="emit('nuevo')"
      >
        <Plus class="size-4" />
      </Button>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <TagsMultiSelect
        mode="single"
        label="Filtrar por tipo"
        placeholder="Tipo"
        :options="tipos"
        :model-value="tagFilters.tipo"
        @update:model-value="(ids) => updateGroup('tipo', ids)"
      />
      <TagsMultiSelect
        mode="multiple"
        label="Filtrar por concepto"
        placeholder="Conceptos"
        :options="conceptos"
        :model-value="tagFilters.concepto"
        @update:model-value="(ids) => updateGroup('concepto', ids)"
      />
      <TagsMultiSelect
        mode="multiple"
        label="Filtrar por persona"
        placeholder="Personas"
        :options="personas"
        :model-value="tagFilters.persona"
        @update:model-value="(ids) => updateGroup('persona', ids)"
      />
      <TagsMultiSelect
        mode="single"
        label="Filtrar por estado"
        placeholder="Estados"
        :options="estados"
        :model-value="tagFilters.estado"
        @update:model-value="(ids) => updateGroup('estado', ids)"
      />

      <div class="relative flex items-center">
        <Search class="absolute left-2 size-3.5 text-muted-foreground pointer-events-none" />
        <input
          :value="detailQuery"
          type="text"
          placeholder="Buscar por detalle..."
          aria-label="Buscar por detalle"
          class="h-8 w-48 rounded-md border border-border bg-background pl-7 pr-7 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring placeholder:text-muted-foreground"
          @input="emit('update:detailQuery', ($event.target as HTMLInputElement).value)"
        />
        <button
          v-if="detailQuery"
          class="absolute right-0.5 grid size-7 place-items-center rounded text-muted-foreground hover:text-foreground pointer-coarse:size-8"
          aria-label="Limpiar búsqueda"
          @click="emit('update:detailQuery', '')"
        >
          <X class="size-3.5" />
        </button>
      </div>

      <Button
        v-if="hasActiveFilters"
        variant="ghost"
        size="icon"
        class="size-7 text-muted-foreground hover:text-foreground"
        aria-label="Limpiar filtros"
        title="Limpiar filtros"
        @click="clearFilters"
      >
        <Eraser class="size-3.5" />
      </Button>
    </div>
  </div>
</template>
