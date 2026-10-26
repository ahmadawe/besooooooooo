import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  nitro: {
    preset: "cloudflare-pages", // تغيير الـ preset ليتناسب مع Cloudflare بدلاً من vercel
  },
  vite: {
    plugins: [], // إضافة هذه الخانة لكي تقرأها أداة Wrangler بدون أخطاء
  },
  tanstackstart: {
    server: { entry: "server" },
  },
});