<script setup lang="ts">
import type { Component } from "vue";
import { CreditCard, LayoutDashboard, Tag, Users } from "lucide-vue-next";
import { RouterLink } from "vue-router";
import { cn } from "@/lib/utils";
import Logo from "@/components/app/Logo.vue";
import IconIngreso from "@/components/icons/IconIngreso.vue";
import IconEgreso from "@/components/icons/IconEgreso.vue";
import IconBalance from "@/components/icons/IconBalance.vue";

defineProps<{ collapsed: boolean }>();

type NavItem = {
  to: string;
  label: string;
  icon: Component;
  disabled?: boolean;
};
type NavGroup = { label: string; items: NavItem[] };

const groups: NavGroup[] = [
  {
    label: "Finanzas",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard },
      { to: "/egresos", label: "Egresos", icon: IconEgreso },
      { to: "/ingresos", label: "Ingresos", icon: IconIngreso },
      { to: "/balance", label: "Balance", icon: IconBalance },
    ],
  },
  {
    label: "Cartera",
    items: [
      { to: "/deudas", label: "Deudas", icon: CreditCard },
      { to: "/personas", label: "Personas", icon: Users, disabled: true },
    ],
  },
  {
    label: "Configuración",
    items: [{ to: "/tags", label: "Tags", icon: Tag }],
  },
];
</script>

<template>
  <aside
    :class="cn(
      'flex flex-col gap-0.5 border-r border-border bg-card p-2 transition-[width] duration-200',
      collapsed ? 'w-14' : 'w-54',
    )"
  >
    <div class="flex items-center gap-2 px-2 pb-3 pt-1">
      <Logo :size="28" />
      <span v-if="!collapsed" class="font-display text-sm font-bold tracking-tight">MiTarasca</span>
    </div>

    <template v-for="group in groups" :key="group.label">
      <div v-if="!collapsed" class="px-2.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {{ group.label }}
      </div>
      <RouterLink
        v-for="item in group.items"
        :key="item.to"
        :to="item.disabled ? '' : item.to"
        :title="collapsed ? item.label : undefined"
        :tabindex="item.disabled ? -1 : 0"
        :aria-disabled="item.disabled"
        :class="cn(
          'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-card-foreground transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          item.disabled && 'pointer-events-none opacity-40',
          collapsed && 'justify-center',
        )"
        active-class="bg-primary/15 text-primary [&_svg]:text-primary"
      >
        <component :is="item.icon" class="size-4 shrink-0 text-muted-foreground" />
        <span v-if="!collapsed">{{ item.label }}</span>
      </RouterLink>
    </template>
  </aside>
</template>
