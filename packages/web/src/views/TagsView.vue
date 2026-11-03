<script setup lang="ts">
import { Archive, ArchiveRestore, Pencil, Plus } from "@lucide/vue";
import { computed, ref, watch } from "vue";
import { toast } from "vue-sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import TagForm from "@/components/tags/TagForm.vue";
import { type TagOption, useTags } from "@/composables/useTags";
import EmptyState from "@/components/app/EmptyState.vue";
import EmptyTags from "@/components/icons/empty/EmptyTags.vue";

const { items, loading, error, create, update, archive } = useTags();

const KIND_LABELS: Record<TagOption["kind"], string> = {
  tipo: "Tipo",
  concepto: "Concepto",
  estado: "Estado",
  medio_pago: "Medio de pago",
  persona: "Persona",
};

const ALCANCE_LABELS: Record<TagOption["alcance"], string> = {
  general: "General",
  ingreso: "Ingreso",
  egreso: "Egreso",
};

const kindFilter = ref<TagOption["kind"] | "todos">("todos");

const filteredItems = computed(() => {
  if (kindFilter.value === "todos") return items.value;
  return items.value.filter((t) => t.kind === kindFilter.value);
});

const formOpen = ref(false);
const editingTag = ref<TagOption | null>(null);

watch(formOpen, (isOpen) => {
  if (!isOpen) editingTag.value = null;
});

function onNewTag() {
  editingTag.value = null;
  formOpen.value = true;
}

function onEditRequest(t: TagOption) {
  editingTag.value = t;
  formOpen.value = true;
}

async function onSubmit(data: { kind: TagOption["kind"]; nombre: string; color: string; alcance: TagOption["alcance"] }) {
  try {
    if (editingTag.value) {
      await update(editingTag.value.id, { nombre: data.nombre, color: data.color, alcance: data.alcance });
      toast.success("Tag actualizado");
    } else {
      await create(data);
      toast.success("Tag creado");
    }
    formOpen.value = false;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Error al guardar el tag");
  }
}

let pendingArchiveId: number | null = null;
const archiveCandidateId = ref<number | null>(null);

function onArchiveRequest(t: TagOption) {
  if (t.kind === "estado") return;
  pendingArchiveId = t.id;
  archiveCandidateId.value = t.id;
}

function onArchiveDialogOpenChange(isOpen: boolean) {
  if (!isOpen) archiveCandidateId.value = null;
}

async function onConfirmArchive() {
  const id = pendingArchiveId;
  if (id == null) return;
  pendingArchiveId = null;
  try {
    await archive(id);
    toast.success("Tag archivado");
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Error al archivar el tag");
  }
}

async function onReactivate(t: TagOption) {
  try {
    await update(t.id, { activo: true });
    toast.success("Tag reactivado");
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Error al reactivar el tag");
  }
}
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <header class="mb-4 flex items-center justify-between">
      <h1 class="text-xl font-bold tracking-tight font-display">Tags</h1>
      <Button size="sm" @click="onNewTag">
        <Plus class="size-4" />
        Nuevo tag
      </Button>
    </header>

    <div v-if="error" role="alert" class="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
      {{ error }}
    </div>

    <div class="mb-4 grid max-w-xs gap-1.5">
      <Select v-model="kindFilter">
        <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos los kind</SelectItem>
          <SelectItem v-for="(label, k) in KIND_LABELS" :key="k" :value="k">{{ label }}</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div class="rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead class="w-[28px]" />
            <TableHead>Nombre</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Alcance</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead class="w-[110px] text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-if="loading">
            <TableCell :colspan="6" class="text-center text-sm text-muted-foreground"><span role="status">Cargando…</span></TableCell>
          </TableRow>
          <TableEmpty v-else-if="filteredItems.length === 0" :colspan="6">
            <EmptyState
              :icon="EmptyTags"
              title="Sin etiquetas creadas"
              description="Definí tipo, concepto, estado, medio y persona."
            />
          </TableEmpty>
          <TableRow v-for="t in filteredItems" :key="t.id">
            <TableCell>
              <span class="inline-block size-3.5 rounded-full border border-border" :style="{ backgroundColor: t.color }" />
            </TableCell>
            <TableCell class="text-sm">{{ t.nombre }}</TableCell>
            <TableCell><Badge variant="secondary">{{ KIND_LABELS[t.kind] }}</Badge></TableCell>
            <TableCell><Badge variant="outline">{{ ALCANCE_LABELS[t.alcance] }}</Badge></TableCell>
            <TableCell>
              <Badge :class="t.activo ? 'bg-pos-soft text-pos' : 'bg-muted text-muted-foreground'">
                {{ t.activo ? "Activo" : "Archivado" }}
              </Badge>
            </TableCell>
            <TableCell class="text-right">
              <div class="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-7 text-muted-foreground hover:text-foreground"
                  :aria-label="`Editar ${t.nombre}`"
                  :title="`Editar ${t.nombre}`"
                  @click="onEditRequest(t)"
                >
                  <Pencil class="size-3.5" />
                </Button>
                <Button
                  v-if="t.activo"
                  variant="ghost"
                  size="icon"
                  class="size-7 text-muted-foreground hover:text-destructive"
                  :disabled="t.kind === 'estado'"
                  :aria-label="`Archivar ${t.nombre}`"
                  :title="t.kind === 'estado' ? 'No se puede archivar un tag de kind=estado' : `Archivar ${t.nombre}`"
                  @click="onArchiveRequest(t)"
                >
                  <Archive class="size-3.5" />
                </Button>
                <Button
                  v-else
                  variant="ghost"
                  size="icon"
                  class="size-7 text-muted-foreground hover:text-foreground"
                  :aria-label="`Reactivar ${t.nombre}`"
                  :title="`Reactivar ${t.nombre}`"
                  @click="onReactivate(t)"
                >
                  <ArchiveRestore class="size-3.5" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <TagForm v-model:open="formOpen" :tag="editingTag ?? undefined" @submit="onSubmit" />

    <AlertDialog :open="archiveCandidateId !== null" @update:open="onArchiveDialogOpenChange">
      <AlertDialogContent class="pointer-events-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>¿Archivar tag?</AlertDialogTitle>
          <AlertDialogDescription>
            El tag dejará de estar disponible para nuevos movimientos. Los movimientos existentes que ya lo usan lo conservarán.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction @click="onConfirmArchive">Archivar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
