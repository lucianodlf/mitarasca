<script setup lang="ts">
import { PanelLeft, Search } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import AppSidebar from "@/components/app/AppSidebar.vue";
import CommandPalette from "@/components/app/CommandPalette.vue";
import ThemeToggle from "@/components/app/ThemeToggle.vue";
import { useCommandPaletteState } from "@/composables/useCommandPalette";
import { useSidebar } from "@/composables/useSidebar";

const { collapsed, toggle } = useSidebar();
const { open: paletteOpen } = useCommandPaletteState();
</script>

<template>
  <div class="grid h-screen grid-cols-[auto_1fr] overflow-hidden">
    <AppSidebar :collapsed="collapsed" />

    <div class="flex min-h-0 min-w-0 flex-col">
      <header class="flex items-center gap-3 border-b border-border bg-background px-4 py-2.5">
        <Button variant="outline" size="icon" class="size-8" aria-label="Colapsar menú" @click="toggle">
          <PanelLeft class="size-4" />
        </Button>

        <button
          type="button"
          class="flex max-w-90 flex-1 items-center gap-2 rounded-md border border-input bg-card px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          @click="paletteOpen = true"
        >
          <Search class="size-4" />
          <span>Buscar...</span>
          <kbd class="ml-auto rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]">⌘K</kbd>
        </button>

        <div class="flex-1" />
        <ThemeToggle />
      </header>

      <main class="min-h-0 flex-1 overflow-auto p-4">
        <RouterView />
      </main>
    </div>

    <CommandPalette />
  </div>
</template>
