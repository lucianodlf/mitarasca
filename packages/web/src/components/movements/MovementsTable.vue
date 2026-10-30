<script setup lang="ts">
import { ArrowDown, ArrowUp, ArrowUpDown, Ban, Link2, Pencil, Trash2 } from "lucide-vue-next";
import IconIngreso from "@/components/icons/IconIngreso.vue";
import IconEgreso from "@/components/icons/IconEgreso.vue";
import IconPagado from "@/components/icons/IconPagado.vue";
import IconAdeudado from "@/components/icons/IconAdeudado.vue";
import IconFijo from "@/components/icons/IconFijo.vue";
import IconVariable from "@/components/icons/IconVariable.vue";
import { useRouter } from "vue-router";
import { toast } from "vue-sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import EmptyState from "@/components/app/EmptyState.vue";
import EmptyMovimientos from "@/components/icons/empty/EmptyMovimientos.vue";
import { formatDayMonth, formatSigned } from "@/lib/format";
import { tagBadgeStyle } from "@/lib/tag-color";
import { trpc } from "@/lib/trpc";
import type { MovementWithTags } from "@/composables/useMovements";

defineProps<{
  movements: MovementWithTags[];
  loading: boolean;
  sortField?: "detalle" | "fecha" | "monto";
  sortDir?: "asc" | "desc";
  selectedId?: number | null;
}>();
const emit = defineEmits<{
  edit: [movement: MovementWithTags];
  "delete-request": [id: number];
  sort: [field: "detalle" | "fecha" | "monto"];
  changed: [];
}>();

const router = useRouter();

function goToDebt(m: MovementWithTags) {
  if (m.installment_id == null) return;
  router.push({ name: "deudas", query: { installmentId: String(m.installment_id) } });
}

const ESTADO_DESHABILITADO = "Deshabilitado";

function estadoTag(m: MovementWithTags) {
  return m.tags.find((t) => t.kind === "estado");
}

function isDeshabilitado(m: MovementWithTags) {
  return estadoTag(m)?.nombre === ESTADO_DESHABILITADO;
}

function tipoTag(m: MovementWithTags) {
  return m.tags.find((t) => t.kind === "tipo");
}

function otherTags(m: MovementWithTags) {
  return m.tags.filter((t) => t.kind !== "estado" && t.kind !== "tipo");
}

/** "2026-08-04T14:22:05.000Z" -> "04/08/2026 14:22:05" */
function formatImportedAt(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function onPagoRapido(m: MovementWithTags) {
  try {
    if (m.installment_id != null) {
      await trpc.debts.toggleInstallmentEstado.mutate({ id: m.installment_id });
    } else {
      await trpc.movements.toggleEstado.mutate({ id: m.id });
    }
    emit("changed");
    toast.success("Movimiento marcado como pagado");
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Error al marcar el movimiento como pagado");
  }
}
</script>

<template>
  <div class="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead class="min-w-[180px]">
            <button class="inline-flex items-center gap-1 hover:text-foreground" @click="emit('sort', 'detalle')">
              Detalle
              <ArrowUp v-if="sortField === 'detalle' && sortDir === 'asc'" class="size-3.5" />
              <ArrowDown v-else-if="sortField === 'detalle' && sortDir === 'desc'" class="size-3.5" />
              <ArrowUpDown v-else class="size-3.5 opacity-30" />
            </button>
          </TableHead>
          <TableHead class="w-[64px]">
            <button class="inline-flex items-center gap-1 hover:text-foreground" @click="emit('sort', 'fecha')">
              Fecha
              <ArrowUp v-if="sortField === 'fecha' && sortDir === 'asc'" class="size-3.5" />
              <ArrowDown v-else-if="sortField === 'fecha' && sortDir === 'desc'" class="size-3.5" />
              <ArrowUpDown v-else class="size-3.5 opacity-30" />
            </button>
          </TableHead>
          <TableHead>Tags</TableHead>
          <TableHead class="w-[110px]">Estado</TableHead>
          <TableHead class="w-[130px] text-right">
            <button class="inline-flex items-center gap-1 hover:text-foreground" @click="emit('sort', 'monto')">
              Monto
              <ArrowUp v-if="sortField === 'monto' && sortDir === 'asc'" class="size-3.5" />
              <ArrowDown v-else-if="sortField === 'monto' && sortDir === 'desc'" class="size-3.5" />
              <ArrowUpDown v-else class="size-3.5 opacity-30" />
            </button>
          </TableHead>
          <TableHead class="w-[40px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-if="loading">
          <TableCell :colspan="6" class="text-center text-sm text-muted-foreground">
            Cargando…
          </TableCell>
        </TableRow>
        <TableEmpty v-else-if="movements.length === 0" :colspan="6">
          <EmptyState
            :icon="EmptyMovimientos"
            title="Sin movimientos todavía"
            description="Cargá el primer gasto o ingreso del mes."
          />
        </TableEmpty>
        <TableRow
          v-for="m in movements"
          :key="m.id"
          :data-movement-id="m.id"
          tabindex="0"
          :class="[
            'cursor-pointer focus-visible:outline-none focus-visible:-outline-offset-2',
            m.id === selectedId ? 'row-selected' : 'focus-visible:ring-2 focus-visible:ring-ring',
            isDeshabilitado(m) && 'opacity-50',
          ]"
          @click="emit('edit', m)"
        >
          <TableCell>
            <div class="flex items-center gap-2.5">
              <span
                :class="[
                  'grid size-5.5 shrink-0 place-items-center rounded-md',
                  m.direccion === 'in' ? 'bg-pos-soft text-pos' : 'bg-neg-soft text-neg',
                ]"
              >
                <IconIngreso v-if="m.direccion === 'in'" class="size-3.5" />
                <IconEgreso v-else class="size-3.5" />
              </span>
              <span :class="['truncate text-sm', isDeshabilitado(m) && 'line-through']">{{ m.detalle }}</span>
              <span
                v-if="m.imported_at"
                class="text-muted-foreground/60 text-[10px] leading-none"
                :title="`Importado el ${formatImportedAt(m.imported_at)}`"
                aria-label="Movimiento importado"
                >●</span
              >
              <span
                v-if="m.regla_op === 'div' && (m.regla_factor ?? 0) > 1"
                :class="[
                  'inline-block size-2 rounded-full',
                  m.shares_pendientes
                    ? 'bg-orange-500 shadow-[0_0_6px_2px_rgba(249,115,22,0.7)]'
                    : 'bg-green-500 shadow-[0_0_6px_2px_rgba(34,197,94,0.7)]',
                ]"
                :aria-label="m.shares_pendientes ? 'División pendiente de pago' : 'División completa'"
              />
            </div>
          </TableCell>
          <TableCell class="num text-xs">{{ formatDayMonth(m.fecha) }}</TableCell>
          <TableCell>
            <div class="flex flex-wrap gap-1">
              <Badge v-if="tipoTag(m)" variant="secondary" class="gap-1 bg-primary/10 text-primary">
                <IconFijo v-if="tipoTag(m)?.nombre === 'Fijo'" class="size-3" />
                <IconVariable v-else class="size-3" />
                {{ tipoTag(m)?.nombre }}
              </Badge>
              <Badge v-for="t in otherTags(m)" :key="t.id" variant="secondary" :style="tagBadgeStyle(t.color)">
                {{ t.nombre }}
              </Badge>
              <Badge v-if="m.regla_op !== 'none'" variant="secondary" class="bg-primary/10 text-primary">
                {{ m.regla_op === "div" ? "÷" : "×" }}{{ m.regla_factor }}
              </Badge>
            </div>
          </TableCell>
          <TableCell>
            <Badge
              v-if="estadoTag(m)"
              class="gap-1"
              :class="
                isDeshabilitado(m)
                  ? 'bg-muted text-muted-foreground'
                  : estadoTag(m)?.nombre === 'Pagado'
                    ? 'bg-pos-soft text-pos'
                    : 'bg-warn-soft text-accent-foreground'
              "
            >
              <Ban v-if="isDeshabilitado(m)" class="size-3" />
              <IconPagado v-else-if="estadoTag(m)?.nombre === 'Pagado'" class="size-3" />
              <IconAdeudado v-else class="size-3" />
              {{ estadoTag(m)?.nombre }}
            </Badge>
          </TableCell>
          <TableCell
            :class="[
              'num text-right font-semibold',
              isDeshabilitado(m) ? 'text-muted-foreground line-through' : m.direccion === 'in' ? 'text-pos' : 'text-neg',
            ]"
          >
            {{ formatSigned(m.monto_efectivo, m.direccion) }}
          </TableCell>
          <TableCell>
            <div class="flex items-center gap-1">
              <Button
                v-if="estadoTag(m)?.nombre !== 'Pagado' && !isDeshabilitado(m)"
                variant="ghost"
                size="icon"
                class="size-7 text-muted-foreground hover:text-pos"
                :aria-label="`Marcar ${m.detalle} como pagado`"
                @click.stop="onPagoRapido(m)"
              >
                <IconPagado class="size-3.5" />
              </Button>
              <Button
                v-if="m.installment_id != null"
                variant="ghost"
                size="icon"
                class="size-7 text-muted-foreground hover:text-primary"
                :aria-label="`Ver cuota vinculada a ${m.detalle}`"
                @click.stop="goToDebt(m)"
              >
                <Link2 class="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="size-7 text-muted-foreground hover:text-foreground"
                :aria-label="`Editar ${m.detalle}`"
                @click.stop="emit('edit', m)"
              >
                <Pencil class="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="size-7 text-muted-foreground hover:text-destructive"
                :aria-label="`Eliminar ${m.detalle}`"
                @click.stop="emit('delete-request', m.id)"
              >
                <Trash2 class="size-3.5" />
              </Button>
            </div>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>
