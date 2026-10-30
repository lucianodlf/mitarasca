import { onMounted, ref } from "vue";

type Theme = "light" | "dark";
const STORAGE_KEY = "mitarasca:theme";

const theme = ref<Theme>("light");

function apply(value: Theme) {
  document.documentElement.classList.toggle("dark", value === "dark");
}

/** Tema persistido en localStorage; respeta prefers-color-scheme en el primer arranque. */
export function useTheme() {
  onMounted(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    theme.value = stored ?? (prefersDark ? "dark" : "light");
    apply(theme.value);
  });

  function toggle() {
    theme.value = theme.value === "dark" ? "light" : "dark";
    localStorage.setItem(STORAGE_KEY, theme.value);
    apply(theme.value);
  }

  return { theme, toggle };
}
