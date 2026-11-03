<script setup lang="ts">
import { Moon, Sun } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/composables/useTheme";

const { theme, toggle } = useTheme();
</script>

<template>
  <Button
    variant="outline"
    size="icon"
    class="size-8"
    :aria-label="theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'"
    @click="toggle"
  >
    <Sun v-if="theme === 'dark'" class="size-4" />
    <Moon v-else class="size-4" />
  </Button>
</template>
