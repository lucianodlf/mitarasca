<script setup lang="ts">
import { Check, ChevronDown } from "@lucide/vue";
import { computed, ref, watch } from "vue";
import {
  Combobox,
  ComboboxAnchor,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
  ComboboxTrigger,
  ComboboxViewport,
} from "@/components/ui/combobox";
import {
  TagsInput,
  TagsInputInput,
  TagsInputItem,
  TagsInputItemDelete,
  TagsInputItemText,
} from "@/components/ui/tags-input";
import { tagBadgeStyle } from "@/lib/tag-color";
import { cn } from "@/lib/utils";

type Option = { id: number; nombre: string; color?: string };

const props = withDefaults(
  defineProps<{
    modelValue: number[];
    options: Option[];
    mode?: "single" | "multiple";
    placeholder?: string;
    label?: string;
    class?: string;
  }>(),
  { mode: "multiple" }
);

const emit = defineEmits<{ "update:modelValue": [ids: number[]] }>();

const query = ref("");
const open = ref(false);

const selectedOptions = computed(() =>
  props.modelValue
    .map((id) => props.options.find((o) => o.id === id))
    .filter((o): o is Option => o !== undefined)
);

const filteredOptions = computed(() => {
  const q = query.value.trim().toLowerCase();
  const base = q ? props.options.filter((o) => o.nombre.toLowerCase().includes(q)) : props.options;
  return base.filter((o) => !props.modelValue.includes(o.id));
});

function onUpdate(values: unknown) {
  const ids = (values as Option[]).map((v) => v.id);
  emit("update:modelValue", props.mode === "single" ? ids.slice(-1) : ids);
  query.value = "";
}

function onSpaceOpen(event: KeyboardEvent) {
  if (query.value.length === 0) {
    event.preventDefault();
    open.value = true;
  }
}

watch(
  () => props.modelValue,
  () => {
    query.value = "";
  }
);
</script>

<template>
  <Combobox
    v-model:open="open"
    :model-value="selectedOptions"
    multiple
    ignore-filter
    :aria-label="label"
    :class="cn('w-44', props.class)"
    @update:model-value="onUpdate"
  >
    <ComboboxAnchor as-child class="relative w-full">
      <TagsInput
        :model-value="selectedOptions"
        class="flex min-h-8 max-h-20 w-full flex-wrap content-start gap-1 overflow-y-auto py-1 pr-6 text-sm"
        @update:model-value="onUpdate"
      >
        <TagsInputItem
          v-for="item in selectedOptions"
          :key="item.id"
          :value="item"
          class="h-6 shrink-0 gap-1 pl-2"
          :style="tagBadgeStyle(item.color)"
        >
          <TagsInputItemText class="px-0 text-xs">{{ item.nombre }}</TagsInputItemText>
          <TagsInputItemDelete :aria-label="`Quitar ${item.nombre}`" />
        </TagsInputItem>

        <ComboboxInput v-model="query" as-child>
          <TagsInputInput
            :placeholder="selectedOptions.length ? undefined : placeholder"
            :class="[
              'text-xs',
              open || !selectedOptions.length
                ? 'min-w-[3ch] flex-1 basis-8'
                : 'h-0 w-0 min-h-0 min-w-0 basis-0 overflow-hidden border-0 p-0',
            ]"
            @keydown.enter.prevent
            @keydown.space="onSpaceOpen"
            @focus="open = true"
          />
        </ComboboxInput>

        <ComboboxTrigger class="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground">
          <ChevronDown class="size-3.5" />
        </ComboboxTrigger>
      </TagsInput>
    </ComboboxAnchor>

    <ComboboxList class="w-44">
      <ComboboxViewport>
        <ComboboxEmpty class="py-2 text-xs">Sin resultados</ComboboxEmpty>
        <ComboboxItem
          v-for="option in filteredOptions"
          :key="option.id"
          :value="option"
          class="text-xs"
        >
          <ComboboxItemIndicator>
            <Check class="size-3.5" />
          </ComboboxItemIndicator>
          <span :style="tagBadgeStyle(option.color)">{{ option.nombre }}</span>
        </ComboboxItem>
      </ComboboxViewport>
    </ComboboxList>
  </Combobox>
</template>
