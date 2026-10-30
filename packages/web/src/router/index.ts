import { type RouteRecordRaw, createRouter, createWebHistory } from "vue-router";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "dashboard",
    component: () => import("@/views/DashboardView.vue"),
    meta: { title: "Dashboard" },
  },
  {
    path: "/egresos",
    name: "egresos",
    component: () => import("@/views/MovementsView.vue"),
    props: { direccion: "out" },
    meta: { title: "Egresos" },
  },
  {
    path: "/ingresos",
    name: "ingresos",
    component: () => import("@/views/MovementsView.vue"),
    props: { direccion: "in" },
    meta: { title: "Ingresos" },
  },
  {
    path: "/balance",
    name: "balance",
    component: () => import("@/views/BalanceView.vue"),
    meta: { title: "Balance" },
  },
  {
    path: "/deudas",
    name: "deudas",
    component: () => import("@/views/DebtsView.vue"),
    meta: { title: "Deudas" },
  },
  {
    path: "/tags",
    name: "tags",
    component: () => import("@/views/TagsView.vue"),
    meta: { title: "Tags" },
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
