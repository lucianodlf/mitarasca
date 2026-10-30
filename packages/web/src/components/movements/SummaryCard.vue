<script setup lang="ts">
import type { Component } from "vue";
import { formatMoney } from "@/lib/format";

defineProps<{
  label: string;
  icon: Component;
  value: number | null;
  tone: "pos" | "neg" | "neutral";
  subtotal?: number;
  subtotalCount?: number;
}>();

const toneClass = {
  pos: "text-pos",
  neg: "text-neg",
  neutral: "",
} as const;
</script>

<template>
  <div class="rounded-xl border border-border bg-card p-3.5">
    <div class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      <component :is="icon" class="size-3.5" /> {{ label }}
    </div>
    <div class="num mt-1.5 text-2xl font-semibold" :class="toneClass[tone]">
      {{ value !== null ? formatMoney(value) : "…" }}
    </div>
    <div class="mt-1 h-4 text-xs text-muted-foreground">
      <span v-if="subtotal !== undefined && subtotalCount !== undefined">
        Filtrado: {{ formatMoney(subtotal) }} · {{ subtotalCount }} mov.
      </span>
    </div>
  </div>
</template>
