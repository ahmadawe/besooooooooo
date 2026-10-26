# بنك الكريمي - واجهة تجريبية

تطبيق TanStack Start متصل بـ Supabase، جاهز للنشر على Vercel.

## المتطلبات

- مشروع Supabase فعال مع Anonymous Sign-in وEmail/Password.
- تشغيل `supabase-migration.sql` من SQL Editor.

## إعداد البيئة

أنشئ ملف `.env.local` محليًا:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

على Vercel أضف المتغيرين السابقين في:
Project Settings > Environment Variables.

## التشغيل

```sh
npm install
npm run dev
npm run build
```

لوحة الإدارة: `/admin`
صفحة التتبع: `/tracking`
