import { MOVEMENTS_PAGE_SIZE } from "@/config";
import { type Ref, onBeforeUnmount, onMounted, ref, watch } from "vue";

export function useInfiniteScroll(sentinel: Ref<HTMLElement | null>, deps: Ref[]) {
  const visibleCount = ref(MOVEMENTS_PAGE_SIZE);

  function loadMore() {
    visibleCount.value += MOVEMENTS_PAGE_SIZE;
  }

  let observer: IntersectionObserver | null = null;

  onMounted(() => {
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "200px" }
    );
    // If sentinel was already bound before observer was created, observe it now
    if (sentinel.value) observer.observe(sentinel.value);
  });

  // Watch sentinel ref — observe when element mounts, unobserve on change
  watch(sentinel, (el, oldEl) => {
    if (oldEl) observer?.unobserve(oldEl);
    if (el) observer?.observe(el);
  });

  // Reset visible count when dependencies change (month, filters, sort)
  watch(deps, () => {
    visibleCount.value = MOVEMENTS_PAGE_SIZE;
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
  });

  return { visibleCount };
}
