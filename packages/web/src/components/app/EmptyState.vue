<script setup lang="ts">
import type { Component } from "vue";

defineProps<{ icon: Component; title: string; description: string }>();
</script>

<template>
  <div class="flex flex-col items-center gap-3 rounded-xl border-[1.5px] border-dashed border-border p-8 text-center">
    <div class="grid size-14 place-items-center rounded-full bg-muted">
      <component :is="icon" class="size-7 text-muted-foreground" />
    </div>
    <div class="text-sm font-bold text-foreground">{{ title }}</div>
    <div class="text-sm text-muted-foreground">{{ description }}</div>
    <slot />
  </div>
</template>
