<script setup lang="ts">
import { PanelLeft, Search } from "@lucide/vue";
import { watch } from "vue";
import { useRoute } from "vue-router";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import AppSidebar from "@/components/app/AppSidebar.vue";
import CommandPalette from "@/components/app/CommandPalette.vue";
import ThemeToggle from "@/components/app/ThemeToggle.vue";
import { useCommandPaletteState } from "@/composables/useCommandPalette";
import { useSidebar } from "@/composables/useSidebar";

const { collapsed, mobileOpen, toggle } = useSidebar();
const route = useRoute();
watch(() => route.fullPath, () => { mobileOpen.value = false; });
const { open: paletteOpen } = useCommandPaletteState();
</script>

<template>
  <a
    href="#contenido"
    class="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:left-2 focus:top-2"
  >
    Saltar al contenido
  </a>
  <div class="grid h-dvh grid-cols-1 overflow-hidden md:grid-cols-[auto_1fr]">
    <div class="hidden md:block">
      <AppSidebar :collapsed="collapsed" />
    </div>

    <Sheet v-model:open="mobileOpen">
      <SheetContent side="left" class="w-60 gap-0 p-0 md:hidden">
        <SheetTitle class="sr-only">Menú</SheetTitle>
        <SheetDescription class="sr-only">Navegación principal</SheetDescription>
        <AppSidebar :collapsed="false" class="w-full border-r-0" />
      </SheetContent>
    </Sheet>

    <div class="flex min-h-0 min-w-0 flex-col">
      <header class="flex items-center gap-3 border-b border-border bg-background px-4 py-2.5">
        <Button variant="outline" size="icon" class="size-10 md:size-8" aria-label="Menú" @click="toggle">
          <PanelLeft class="size-4" />
        </Button>

        <button
          type="button"
          class="flex max-w-90 flex-1 items-center gap-2 rounded-md border border-input bg-card px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          @click="paletteOpen = true"
        >
          <Search class="size-4" />
          <span>Buscar...</span>
          <kbd class="ml-auto rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-label">⌘K</kbd>
        </button>

        <div class="flex-1" />
        <ThemeToggle />
      </header>

      <main id="contenido" tabindex="-1" class="min-h-0 flex-1 overflow-auto p-4 focus:outline-none">
        <RouterView />
      </main>
    </div>

    <CommandPalette />
  </div>
</template>
