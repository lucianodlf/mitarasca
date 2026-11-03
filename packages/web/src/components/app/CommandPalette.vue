<script setup lang="ts">
import { CreditCard, LayoutDashboard, LineChart, Plus, Search } from "@lucide/vue";
import IconIngreso from "@/components/icons/IconIngreso.vue";
import IconEgreso from "@/components/icons/IconEgreso.vue";
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useCommandPalette } from "@/composables/useCommandPalette";
import { searchDetailQuery, useSearchContext } from "@/composables/useSearchContext";
import { formatDayMonth, formatSigned } from "@/lib/format";
import { matchesQuery, parseQuery } from "@/lib/search-parser";
import { tagBadgeStyle } from "@/lib/tag-color";

const { open } = useCommandPalette();
const route = useRoute();
const router = useRouter();
const { movements, direction } = useSearchContext();

// Valor bruto del input — lo sincronizamos vía @update:model-value en CommandInput
const rawInput = ref("");

// Limpia al abrir/cerrar
watch(open, (isOpen) => {
  if (!isOpen) rawInput.value = "";
});

// Contexto actual según la ruta
const contextDir = computed<"in" | "out" | null>(() => {
  if (route.name === "egresos") return "out";
  if (route.name === "ingresos") return "in";
  return null;
});

const contextLabel = computed(() => {
  if (contextDir.value === "out") return "Egresos";
  if (contextDir.value === "in") return "Ingresos";
  return null;
});

const placeholder = computed(() =>
  contextLabel.value ? `Buscar en ${contextLabel.value}…` : "Buscar acción o ir a…",
);

const parsed = computed(() => parseQuery(rawInput.value));

// Hay búsqueda activa (más allá del prefijo vacío)
const hasQuery = computed(
  () =>
    parsed.value.freeText.length > 0 ||
    parsed.value.tags.length > 0 ||
    Object.keys(parsed.value.kind).length > 0,
);

// Scope efectivo: el del prefijo tipado, o el de la ruta actual
const effectiveDir = computed(() => parsed.value.scope ?? contextDir.value);

// ¿El scope pedido difiere del contexto cargado?
const crossContext = computed(
  () => hasQuery.value && effectiveDir.value !== null && effectiveDir.value !== direction.value,
);

// Resultados filtrados (máx. 8)
const results = computed(() => {
  if (!hasQuery.value || crossContext.value) return [];
  return movements.value.filter((m) => matchesQuery(m, parsed.value)).slice(0, 8);
});

function selectMovement(detalle: string) {
  // Aplica el texto libre al filtro inline de la vista
  searchDetailQuery.value = parsed.value.freeText || detalle;
  open.value = false;
}

function go(path: string) {
  open.value = false;
  router.push(path);
}

const nav = [
  { label: "Ir a Dashboard", icon: LayoutDashboard, action: () => go("/") },
  { label: "Ir a Egresos", icon: IconEgreso, action: () => go("/egresos") },
  { label: "Ir a Ingresos", icon: IconIngreso, action: () => go("/ingresos") },
  { label: "Ir a Balance", icon: LineChart, action: () => go("/balance") },
  { label: "Ir a Deudas", icon: CreditCard, action: () => go("/deudas") },
];
const actions = [
  { label: "Nuevo egreso", icon: Plus, action: () => go("/egresos?nuevo=1") },
  { label: "Nuevo ingreso", icon: Plus, action: () => go("/ingresos?nuevo=1") },
];

const crossLabel = computed(() => (effectiveDir.value === "out" ? "Egresos" : "Ingresos"));
const crossPath = computed(() => (effectiveDir.value === "out" ? "/egresos" : "/ingresos"));
</script>

<template>
  <CommandDialog v-model:open="open">
    <CommandInput
      :placeholder="placeholder"
      @update:model-value="(v) => (rawInput = v)"
    />
    <CommandList>
      <!-- Modo búsqueda: resultados de movimientos -->
      <template v-if="hasQuery">
        <!-- Scope pedido pero datos no disponibles → sugerir navegación -->
        <template v-if="crossContext">
          <div class="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            No hay datos de {{ crossLabel }} cargados.
          </div>
          <button
            class="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            @click="go(crossPath + (parsed.freeText ? `?q=${encodeURIComponent(parsed.freeText)}` : ''))"
          >
            <Search class="size-4 text-muted-foreground" />
            Ir a {{ crossLabel }} y buscar
            <span v-if="parsed.freeText" class="font-medium">"{{ parsed.freeText }}"</span>
          </button>
        </template>

        <!-- Resultados en contexto actual -->
        <template v-else>
          <div class="flex items-center justify-between px-3 py-1.5">
            <span class="text-xs font-medium text-muted-foreground">
              {{ contextLabel ?? "Movimientos" }}
            </span>
            <span class="text-xs text-muted-foreground">{{ results.length }} resultado{{ results.length !== 1 ? 's' : '' }}</span>
          </div>

          <div v-if="results.length === 0" class="py-6 text-center text-sm text-muted-foreground">
            Sin resultados.
          </div>

          <button
            v-for="m in results"
            :key="m.id"
            class="flex w-full cursor-pointer flex-col gap-0.5 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            @click="selectMovement(m.detalle)"
          >
            <div class="flex w-full items-center justify-between gap-2">
              <div class="flex min-w-0 items-center gap-1.5">
                <component
                  :is="m.direccion === 'out' ? IconEgreso : IconIngreso"
                  class="size-3.5 shrink-0"
                  :class="m.direccion === 'out' ? 'text-neg' : 'text-pos'"
                />
                <span class="truncate">{{ m.detalle }}</span>
              </div>
              <div class="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                <span>{{ formatDayMonth(m.fecha) }}</span>
                <span :class="m.direccion === 'out' ? 'text-neg' : 'text-pos'">
                  {{ formatSigned(m.monto_efectivo, m.direccion) }}
                </span>
              </div>
            </div>
            <div v-if="m.tags.length" class="flex flex-wrap gap-1 pl-5">
              <span
                v-for="t in m.tags"
                :key="t.id"
                class="rounded px-1 py-px text-label font-medium"
                :style="tagBadgeStyle(t.color)"
              >{{ t.nombre }}</span>
            </div>
          </button>

          <!-- Hint de sintaxis -->
          <div class="border-t px-3 py-1.5 text-label text-muted-foreground">
            tags:nombre &nbsp;·&nbsp; estado:pagado &nbsp;·&nbsp; tipo:fijo &nbsp;·&nbsp; ing:/egr: para cambiar contexto
          </div>
        </template>
      </template>

      <!-- Modo navegación: acciones y rutas -->
      <template v-else>
        <CommandEmpty>Sin resultados.</CommandEmpty>
        <CommandGroup heading="Navegar">
          <CommandItem
            v-for="item in nav"
            :key="item.label"
            :value="item.label"
            @select="item.action"
          >
            <component :is="item.icon" class="size-4 text-muted-foreground" />
            {{ item.label }}
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Acciones">
          <CommandItem
            v-for="item in actions"
            :key="item.label"
            :value="item.label"
            @select="item.action"
          >
            <component :is="item.icon" class="size-4 text-muted-foreground" />
            {{ item.label }}
          </CommandItem>
        </CommandGroup>
      </template>
    </CommandList>
  </CommandDialog>
</template>
