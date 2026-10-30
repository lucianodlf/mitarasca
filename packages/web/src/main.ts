import { createPinia } from "pinia";
import { createApp } from "vue";
import "vue-sonner/style.css";
import App from "./App.vue";
import "./assets/index.css";
import { router } from "./router";

createApp(App).use(createPinia()).use(router).mount("#app");
