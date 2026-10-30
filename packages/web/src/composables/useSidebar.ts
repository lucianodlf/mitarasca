import { onMounted, ref } from "vue";

const STORAGE_KEY = "mitarasca:sidebar-collapsed";

const collapsed = ref(false);

/** Estado colapsado del sidebar, persistido en localStorage. */
export function useSidebar() {
  onMounted(() => {
    collapsed.value = localStorage.getItem(STORAGE_KEY) === "1";
  });

  function toggle() {
    collapsed.value = !collapsed.value;
    localStorage.setItem(STORAGE_KEY, collapsed.value ? "1" : "0");
  }

  return { collapsed, toggle };
}
