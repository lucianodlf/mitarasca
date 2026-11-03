import { useMediaQuery } from "@vueuse/core";
import { onMounted, ref } from "vue";

const STORAGE_KEY = "mitarasca:sidebar-collapsed";

const collapsed = ref(false);
const mobileOpen = ref(false);

/** Estado del sidebar: colapsado (persistido en localStorage) en escritorio, drawer bajo 768px. */
export function useSidebar() {
  const isMobile = useMediaQuery("(max-width: 767px)");

  onMounted(() => {
    collapsed.value = localStorage.getItem(STORAGE_KEY) === "1";
  });

  function toggle() {
    if (isMobile.value) {
      mobileOpen.value = !mobileOpen.value;
      return;
    }
    collapsed.value = !collapsed.value;
    localStorage.setItem(STORAGE_KEY, collapsed.value ? "1" : "0");
  }

  return { collapsed, mobileOpen, isMobile, toggle };
}
