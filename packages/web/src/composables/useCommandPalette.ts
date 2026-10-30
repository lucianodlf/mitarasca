import { onMounted, onUnmounted, ref } from "vue";

const open = ref(false);

/** Estado global de la command palette + atajo Cmd/Ctrl+K. */
export function useCommandPalette() {
  function onKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      open.value = !open.value;
    }
  }

  onMounted(() => document.addEventListener("keydown", onKeydown));
  onUnmounted(() => document.removeEventListener("keydown", onKeydown));

  return { open };
}

/** Acceso al estado sin registrar el listener (para abrir desde otros componentes). */
export function useCommandPaletteState() {
  return { open };
}
