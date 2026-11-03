<script setup lang="ts">
import { StickyNote } from "@lucide/vue";
import { nextTick, ref } from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const props = defineProps<{ observacion: string | null; label: string }>();
const emit = defineEmits<{ save: [value: string | null] }>();

const editing = ref(false);
const draft = ref("");
const inputRef = ref<InstanceType<typeof Input> | null>(null);

function startEdit() {
  draft.value = props.observacion ?? "";
  editing.value = true;
  nextTick(() => {
    const el = inputRef.value?.$el as HTMLInputElement | undefined;
    el?.focus();
  });
}

function save() {
  editing.value = false;
  const value = draft.value.trim();
  if (value === (props.observacion ?? "")) return;
  emit("save", value.length > 0 ? value : null);
}

function cancel() {
  editing.value = false;
}
</script>

<template>
  <Input
    v-if="editing"
    ref="inputRef"
    v-model="draft"
    class="h-7 w-48 text-xs"
    maxlength="150"
    :placeholder="label"
    :aria-label="`Observación de ${label}`"
    @keydown.enter="save"
    @keydown.escape="cancel"
    @blur="save"
    @click.stop
  />
  <TooltipProvider v-else-if="observacion">
    <Tooltip>
      <TooltipTrigger as-child>
        <Button
          variant="ghost"
          size="icon"
          class="size-6 text-primary"
          :aria-label="`Editar observación: ${observacion}`"
          @click.stop="startEdit"
        >
          <StickyNote class="size-3.5 fill-current" />
        </Button>
      </TooltipTrigger>
      <TooltipContent class="max-w-64">{{ observacion.slice(0, 150) }}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
  <Button
    v-else
    variant="ghost"
    size="icon"
    class="size-6 text-muted-foreground hover:text-foreground"
    :aria-label="`Agregar observación a ${label}`"
    @click.stop="startEdit"
  >
    <StickyNote class="size-3.5" />
  </Button>
</template>
