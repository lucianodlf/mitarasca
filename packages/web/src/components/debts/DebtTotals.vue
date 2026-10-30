<script setup lang="ts">
import { Users } from "lucide-vue-next";
import type { MedioPagoTotals, PersonaTotals } from "@/composables/useDebts";
import { formatMoney } from "@/lib/format";
import IconMedioPago from "@/components/icons/IconMedioPago.vue";
import EmptyState from "@/components/app/EmptyState.vue";
import EmptyDeudas from "@/components/icons/empty/EmptyDeudas.vue";

defineProps<{ totalsByMedioPago: MedioPagoTotals[]; totalsByPersona: PersonaTotals[] }>();
</script>

<template>
  <div class="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
    <div class="rounded-xl border border-border bg-card p-3.5">
      <div class="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <IconMedioPago class="size-3.5" /> Por medio de pago
      </div>
      <EmptyState
        v-if="totalsByMedioPago.length === 0"
        :icon="EmptyDeudas"
        title="Ninguna deuda por acá"
        description="Lo que debés y lo que te deben va a aparecer acá."
      />
      <ul v-else class="flex flex-col gap-1.5">
        <li v-for="t in totalsByMedioPago" :key="t.medio_pago_tag_id" class="flex items-center justify-between text-sm">
          <span class="truncate">{{ t.nombre }}</span>
          <span class="num shrink-0 font-semibold">{{ formatMoney(t.resto) }}</span>
        </li>
      </ul>
    </div>

    <div class="rounded-xl border border-border bg-card p-3.5">
      <div class="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Users class="size-3.5 text-primary" /> Por persona
      </div>
      <EmptyState
        v-if="totalsByPersona.length === 0"
        :icon="EmptyDeudas"
        title="Ninguna deuda por acá"
        description="Lo que debés y lo que te deben va a aparecer acá."
      />
      <template v-else>
        <div class="mb-1 flex items-center justify-end gap-3 text-[10px] text-muted-foreground">
          <span class="w-[76px] text-right">Me debe</span>
          <span class="w-[76px] text-right">Le debo</span>
        </div>
        <ul class="flex flex-col gap-1.5">
          <li v-for="t in totalsByPersona" :key="t.persona_tag_id" class="flex items-center justify-between gap-2 text-sm">
            <span class="truncate">{{ t.nombre }}</span>
            <span class="flex shrink-0 gap-3">
              <span class="num w-[76px] text-right text-pos">{{ t.me_debe > 0 ? formatMoney(t.me_debe) : "—" }}</span>
              <span class="num w-[76px] text-right text-neg">{{ t.le_debo > 0 ? formatMoney(t.le_debo) : "—" }}</span>
            </span>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>
