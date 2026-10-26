import { createFileRoute, Link } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { Check, Clock3, GraduationCap, KeyRound, LogOut, TicketCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  deleteSubmission,
  updateSubmissionCouponStatus,
  updateSubmissionStatus,
  watchSubmissions,
  type ContestStatus,
  type ContestSubmission,
  type CouponReviewStatus,
} from "@/lib/contest";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

const DASHBOARD_ADMIN_EMAIL = "admin@beso.local";
type DashboardFilter =
  | "all"
  | "request_pending"
  | "request_accepted"
  | "request_rejected"
  | "number_pending"
  | "number_accepted"
  | "number_rejected";

const FILTERS: { key: DashboardFilter; label: string }[] = [
  { key: "all", label: "كل الطلبات" },
  { key: "request_pending", label: "الطلب: قيد المراجعة" },
  { key: "request_accepted", label: "الطلب: مقبول" },
  { key: "request_rejected", label: "الطلب: مرفوض" },
  { key: "number_pending", label: "الرقم: قيد المراجعة" },
  { key: "number_accepted", label: "الرقم: مقبول" },
  { key: "number_rejected", label: "الرقم: مرفوض" },
];

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "إدارة المشروع الجامعي التجريبي" }] }),
  component: AdminPage,
});

function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordChangeOpen, setPasswordChangeOpen] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submissions, setSubmissions] = useState<ContestSubmission[]>([]);
  const [filter, setFilter] = useState<DashboardFilter>("all");
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const previousSubmissionsRef = useState<Map<string, ContestSubmission>>(new Map())[0];

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setAuthReady(true);
      return;
    }
    const supabase = getSupabaseClient();

    const checkAdmin = async (currentUser: User | null) => {
      setUser(currentUser);
      setIsAdmin(false);
      if (currentUser) {
        try {
          const { data, error } = await supabase
            .from("admin_users")
            .select("enabled")
            .eq("uid", currentUser.id)
            .maybeSingle();
          if (error) throw error;
          setIsAdmin(data?.enabled === true);
        } catch (roleError) {
          setError(roleError instanceof Error ? roleError.message : "تعذر التحقق من صلاحيات المشرف.");
        }
      }
      setAuthReady(true);
    };

    const sessionTimeout = window.setTimeout(() => {
      setAuthReady(true);
    }, 4000);

    void supabase.auth.getSession()
      .then(({ data }) => {
        window.clearTimeout(sessionTimeout);
        void checkAdmin(data.session?.user ?? null);
      })
      .catch((sessionError) => {
        window.clearTimeout(sessionTimeout);
        setError(sessionError instanceof Error ? sessionError.message : "تعذر قراءة جلسة تسجيل الدخول.");
        setAuthReady(true);
      });

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "SIGNED_OUT") {
        window.clearTimeout(sessionTimeout);
        void checkAdmin(session?.user ?? null);
      }
    });

    return () => {
      window.clearTimeout(sessionTimeout);
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setSubmissions([]);
      return;
    }
    try {
      return watchSubmissions((items) => {
        const previous = previousSubmissionsRef;
        if (previous.size > 0) {
          for (const item of items) {
            const oldItem = previous.get(item.id);
            if (!oldItem) {
              toast.info("وصل عميل جديد");
            } else if (oldItem.status !== item.status) {
              toast.info(item.status === "accepted" ? "تم قبول طلب بيانات العميل" : item.status === "rejected" ? "تم رفض طلب بيانات العميل" : "تم تحديث حالة الطلب");
            } else if (oldItem.couponCode !== item.couponCode) {
              toast.info("تم إرسال رمز جديد من عميل");
            } else if (oldItem.couponStatus !== item.couponStatus) {
              toast.info(item.couponStatus === "accepted" ? "تم قبول الرمز المرسل" : item.couponStatus === "rejected" ? "تم رفض الرمز المرسل" : "تم تحديث حالة الرمز");
            }
          }
          for (const oldItem of previous.values()) {
            if (!items.some((item) => item.id === oldItem.id)) {
              toast.info("تم حذف طلب عميل");
            }
          }
        }
        previous.clear();
        items.forEach((item) => previous.set(item.id, item));
        setSubmissions(items);
      }, (watchError) => setError(watchError.message));
    } catch (watchError) {
      setError(watchError instanceof Error ? watchError.message : "تعذر تحميل الطلبات.");
      return undefined;
    }
  }, [isAdmin]);

  const counts = useMemo(
    () => ({
      all: submissions.length,
      requestPending: submissions.filter((item) => item.status === "pending").length,
      requestAccepted: submissions.filter((item) => item.status === "accepted").length,
      requestRejected: submissions.filter((item) => item.status === "rejected").length,
      numberPending: submissions.filter((item) => item.couponStatus === "pending").length,
      numberAccepted: submissions.filter((item) => item.couponStatus === "accepted").length,
      numberRejected: submissions.filter((item) => item.couponStatus === "rejected").length,
    }),
    [submissions],
  );

  const filteredSubmissions = useMemo(
    () => submissions.filter((item) => matchesFilter(item, filter)),
    [submissions, filter],
  );
  const selectedSubmission = submissions.find((item) => item.id === selectedSubmissionId) ?? null;

  const login = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const supabase = getSupabaseClient();
      await supabase.auth.signOut();
      const { error } = await supabase.auth.signInWithPassword({
        email: DASHBOARD_ADMIN_EMAIL,
        password,
      });
      if (error) throw error;
      setPassword("");
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "تعذر تسجيل الدخول. تحقق من كلمة مرور المشرف وصلاحية الإدارة في Supabase.",
      );
    } finally {
      setLoading(false);
    }
  };

  const changeAdminPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setPasswordChanged(false);
    if (newPassword.length < 6) {
      setError("كلمة المرور الجديدة يجب أن تتكون من 6 أحرف على الأقل.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError("تأكيد كلمة المرور غير مطابق.");
      return;
    }
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      await supabase.auth.signOut();
      const { data: sessionData, error: loginError } = await supabase.auth.signInWithPassword({
        email: DASHBOARD_ADMIN_EMAIL,
        password: currentPassword,
      });
      if (loginError || !sessionData.session) throw loginError ?? new Error("انتهت جلسة الدخول.");
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordChanged(true);
    } catch (passwordError) {
      setError(
        passwordError instanceof Error
          ? passwordError.message
          : "تعذر تغيير كلمة المرور. تأكد من كلمة المرور الحالية وأن الجديدة من 6 أحرف على الأقل.",
      );
    } finally {
      setLoading(false);
    }
  };

  const updateRequestStatus = async (id: string, status: ContestStatus) => {
    setError("");
    try {
      await updateSubmissionStatus(id, status);
      toast.success(status === "accepted" ? "تم قبول بيانات العميل" : "تم رفض بيانات العميل");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "تعذر تحديث حالة الطلب.");
    }
  };

  const deleteCustomerRequest = async (id: string) => {
    if (!window.confirm("هل تريد حذف هذا الطلب نهائيًا؟")) return;
    setError("");
    try {
      await deleteSubmission(id);
      setSelectedSubmissionId(null);
      toast.success("تم حذف الطلب بنجاح");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "تعذر حذف الطلب.");
    }
  };

  const updateNumberStatus = async (id: string, status: "accepted" | "rejected") => {
    setError("");
    try {
      await updateSubmissionCouponStatus(id, status);
      toast.success(status === "accepted" ? "تم قبول الرمز المرسل" : "تم رفض الرمز المرسل");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "تعذر تحديث مراجعة الرقم.");
    }
  };

  if (!authReady)
    return (
      <main className="admin-page" dir="rtl">
        <p>جارٍ التحقق من جلسة الدخول...</p>
      </main>
    );

  if (!isSupabaseConfigured())
    return (
      <main className="admin-page" dir="rtl">
        <h1>إعداد Supabase غير مكتمل</h1>
        <p>أضف إعدادات التطبيق إلى ملف .env.local ثم أعد تشغيل الموقع.</p>
      </main>
    );

  if (!isAdmin)
    return (
      <main className="admin-page admin-login-page" dir="rtl">
        <header className="admin-header">
          <div>
            <span className="admin-brand">
              <GraduationCap /> مختبر المشاريع الجامعية
            </span>
            <h1>دخول المشرف</h1>
            <p>هذه لوحة تجريبية محمية بحساب Supabase وصلاحية إدارة منفصلة.</p>
          </div>
        </header>
        <div className="admin-demo-banner">
          <strong>بيئة جامعية تجريبية.</strong> الدخول بكلمة مرور فقط؛ لا يوجد تسجيل Google أو إنشاء
          حساب من الموقع. يمكن تغيير كلمة مرور المشرف بعد تسجيل الدخول من داخل اللوحة.
        </div>
        {user?.is_anonymous && (
          <p className="demo-error" role="alert">
            جلسة مشاركة تجريبية نشطة. سجّل الدخول بحساب المشرف للمتابعة.
          </p>
        )}
        {error && (
          <p className="demo-error" role="alert">
            {error}
          </p>
        )}
        <form className="admin-login-form" onSubmit={login}>
          <label>
            كلمة المرور
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <Button type="submit" variant="bank" disabled={loading}>
            {loading ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}
          </Button>
        </form>
      </main>
    );

  return (
    <main className="admin-page admin-dashboard-page" dir="rtl">
      <header className="bank-header demo-header admin-bank-header">
        <div className="demo-brand" aria-label="بنك الكريمي">
          <TicketCheck aria-hidden="true" />
        </div>
      </header>
      <div className="admin-dashboard-toolbar">
        <div className="admin-header-actions">
          <Button variant="outline" asChild>
            <Link to="/tracking">تتبع العملاء</Link>
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setPasswordChangeOpen((open) => !open);
              setError("");
              setPasswordChanged(false);
            }}
          >
            <KeyRound /> تغيير كلمة المرور
          </Button>
          <Button variant="outline" onClick={() => void getSupabaseClient().auth.signOut()}>
            <LogOut /> تسجيل الخروج
          </Button>
        </div>
      </div>

      {passwordChangeOpen && (
        <form className="admin-login-form admin-password-form" onSubmit={changeAdminPassword}>
          <h2>تغيير كلمة مرور المشرف</h2>
          <p>استخدم كلمة مرور جديدة من 6 أحرف على الأقل.</p>
          <label>
            كلمة المرور الحالية
            <Input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </label>
          <label>
            كلمة المرور الجديدة
            <Input
              type="password"
              autoComplete="new-password"
              minLength={6}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </label>
          <label>
            تأكيد كلمة المرور الجديدة
            <Input
              type="password"
              autoComplete="new-password"
              minLength={6}
              value={confirmNewPassword}
              onChange={(event) => setConfirmNewPassword(event.target.value)}
              required
            />
          </label>
          {passwordChanged && (
            <p className="password-success" role="status">
              تم تغيير كلمة المرور بنجاح.
            </p>
          )}
          <div className="admin-actions">
            <Button type="submit" variant="bank" disabled={loading}>
              {loading ? "جارٍ التحديث..." : "حفظ كلمة المرور الجديدة"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setPasswordChangeOpen(false)}>
              إلغاء
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p className="demo-error" role="alert">
          {error}
        </p>
      )}

      <section className="admin-stats" aria-label="ملخص الطلبات">
        <Stat label="كل السجلات" value={counts.all} icon={<TicketCheck />} />
        <Stat label="الطلب الأول: مراجعة" value={counts.requestPending} icon={<Clock3 />} />
        <Stat label="الطلب الأول: مقبول" value={counts.requestAccepted} icon={<Check />} />
        <Stat label="الطلب الأول: مرفوض" value={counts.requestRejected} icon={<X />} />
        <Stat label="الرقم: مراجعة" value={counts.numberPending} icon={<Clock3 />} />
        <Stat label="الرقم: مقبول" value={counts.numberAccepted} icon={<Check />} />
        <Stat label="الرقم: مرفوض" value={counts.numberRejected} icon={<X />} />
      </section>

      <nav className="admin-filters" aria-label="تصفية الطلبات">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            className={filter === item.key ? "active" : ""}
            aria-pressed={filter === item.key}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <section className="admin-list" aria-live="polite">
        {filteredSubmissions.length === 0 ? (
          <div className="admin-empty">
            <TicketCheck />
            <h2>لا توجد طلبات هنا</h2>
            <p>ستظهر الطلبات التجريبية بعد إرسالها من الصفحة الرئيسية.</p>
          </div>
        ) : (
          filteredSubmissions.map((item) => (
            <article className="admin-submission admin-submission-clickable" key={item.id}>
              <button
                type="button"
                className="admin-card-open"
                aria-label={`فتح تفاصيل الطلب التجريبي ${item.id.slice(0, 6)}`}
                onClick={() => setSelectedSubmissionId(item.id)}
              >
                <SubmissionSummary item={item} />
                <p className="admin-card-hint">اضغط على البطاقة لعرض كل التفاصيل</p>
              </button>
              <SubmissionActions
                item={item}
                onRequestStatus={(status) => updateRequestStatus(item.id, status)}
                onNumberStatus={(status) => updateNumberStatus(item.id, status)}
                onDelete={() => void deleteCustomerRequest(item.id)}
              />
            </article>
          ))
        )}
      </section>

      <Dialog
        open={Boolean(selectedSubmission)}
        onOpenChange={(open) => {
          if (!open) setSelectedSubmissionId(null);
        }}
      >
        {selectedSubmission && (
          <DialogContent className="admin-details-dialog" dir="rtl">
            <DialogHeader>
              <DialogTitle>تفاصيل سجل العميل التجريبي</DialogTitle>
              <DialogDescription>
                سجل واحد للمرحلتين؛ أي تغيير يظهر للعميل صاحب هذا السجل فقط.
              </DialogDescription>
            </DialogHeader>
            <div className="admin-modal-order">
              <span>رقم السجل</span>
              <strong dir="ltr">#{selectedSubmission.id}</strong>
            </div>
            <dl className="admin-details admin-details-expanded">
              <div>
                <dt>الرقم المميز</dt>
                <dd>{selectedSubmission.participantNumber}</dd>
              </div>
              <div>
                <dt>كلمة المرور</dt>
                <dd>{selectedSubmission.couponReference}</dd>
              </div>
              <div>
                <dt>الرمز المرسل</dt>
                <dd className="admin-coupon" dir="ltr">
                  {selectedSubmission.couponCode || "لم يُرسل بعد"}
                </dd>
              </div>
              <div>
                <dt>حالة الطلب الأول</dt>
                <dd>
                  <span className={`admin-status ${selectedSubmission.status}`}>
                    {requestStatusLabel(selectedSubmission.status)}
                  </span>
                </dd>
              </div>
              <div>
                <dt>حالة مراجعة الرقم</dt>
                <dd>
                  <span
                    className={`admin-status ${numberStatusClass(selectedSubmission.couponStatus)}`}
                  >
                    {numberStatusLabel(selectedSubmission.couponStatus)}
                  </span>
                </dd>
              </div>
              <div>
                <dt>وقت إنشاء الطلب</dt>
                <dd>{new Date(selectedSubmission.createdAt).toLocaleString("ar-EG")}</dd>
              </div>
              <div className="admin-modal-owner">
                <dt>معرّف جلسة العميل</dt>
                <dd dir="ltr">{selectedSubmission.ownerUid}</dd>
              </div>
            </dl>

            <div className="admin-review-block admin-delete-block">
              <Button
                variant="outline"
                onClick={() => void deleteCustomerRequest(selectedSubmission.id)}
              >
                <Trash2 /> حذف الطلب
              </Button>
            </div>

            {selectedSubmission.status === "pending" && (
              <div className="admin-review-block">
                <h3>مراجعة الطلب الأول</h3>
                <div className="admin-actions">
                  <Button
                    variant="bank"
                    onClick={() => updateRequestStatus(selectedSubmission.id, "accepted")}
                  >
                    <Check /> قبول الطلب
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => updateRequestStatus(selectedSubmission.id, "rejected")}
                  >
                    <X /> رفض الطلب
                  </Button>
                </div>
              </div>
            )}

            {selectedSubmission.status === "accepted" &&
              selectedSubmission.couponStatus === "pending" && (
                <div className="admin-review-block">
                  <h3>مراجعة الرمز المرسل</h3>
                  <div className="admin-actions">
                    <Button
                      variant="bank"
                      onClick={() => updateNumberStatus(selectedSubmission.id, "accepted")}
                    >
                      <Check /> قبول الرمز
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => updateNumberStatus(selectedSubmission.id, "rejected")}
                    >
                      <X /> رفض الرمز
                    </Button>
                  </div>
                </div>
              )}
          </DialogContent>
        )}
      </Dialog>
    </main>
  );
}

function matchesFilter(item: ContestSubmission, filter: DashboardFilter) {
  switch (filter) {
    case "request_pending":
      return item.status === "pending";
    case "request_accepted":
      return item.status === "accepted";
    case "request_rejected":
      return item.status === "rejected";
    case "number_pending":
      return item.couponStatus === "pending";
    case "number_accepted":
      return item.couponStatus === "accepted";
    case "number_rejected":
      return item.couponStatus === "rejected";
    default:
      return true;
  }
}

function requestStatusLabel(status: ContestStatus) {
  return status === "pending" ? "قيد المراجعة" : status === "accepted" ? "مقبول" : "مرفوض";
}

function numberStatusLabel(status?: CouponReviewStatus) {
  switch (status ?? "not_submitted") {
    case "pending":
      return "قيد المراجعة";
    case "accepted":
      return "مقبول";
    case "rejected":
      return "مرفوض — يمكن إعادة الإرسال";
    default:
      return "لم يُرسل بعد";
  }
}

function numberStatusClass(status?: CouponReviewStatus) {
  return status === "accepted" ? "accepted" : status === "rejected" ? "rejected" : "";
}

function SubmissionSummary({ item }: { item: ContestSubmission }) {
  return (
    <>
      <div className="admin-submission-top">
        <div>
          <span className="admin-order">طلب تجريبي #{item.id.slice(0, 6).toUpperCase()}</span>
          <span className={`admin-status ${item.status}`}>{requestStatusLabel(item.status)}</span>
        </div>
        <time>{new Date(item.createdAt).toLocaleString("ar-EG")}</time>
      </div>
      <div className="admin-card-statuses">
        <span>حالة الرمز المرسل: {numberStatusLabel(item.couponStatus)}</span>
      </div>
      <dl className="admin-details">
        <div>
          <dt>الرقم المميز</dt>
          <dd>{item.participantNumber}</dd>
        </div>
        <div>
          <dt>كلمة المرور</dt>
          <dd>{item.couponReference}</dd>
        </div>
        <div>
          <dt>الرمز المرسل</dt>
          <dd className="admin-coupon" dir="ltr">
            {item.couponCode || "لم يُرسل بعد"}
          </dd>
        </div>
      </dl>
    </>
  );
}

function SubmissionActions({
  item,
  onRequestStatus,
  onNumberStatus,
  onDelete,
}: {
  item: ContestSubmission;
  onRequestStatus: (status: ContestStatus) => void;
  onNumberStatus: (status: "accepted" | "rejected") => void;
  onDelete: () => void;
}) {
  if (item.status === "pending") {
    return (
      <div className="admin-actions">
        <Button variant="bank" onClick={() => onRequestStatus("accepted")}>
          <Check /> قبول الطلب
        </Button>
        <Button variant="outline" onClick={() => onRequestStatus("rejected")}>
          <X /> رفض الطلب
        </Button>
        <Button variant="outline" onClick={onDelete}>
          <Trash2 /> حذف
        </Button>
      </div>
    );
  }

  if (item.status === "accepted" && item.couponStatus === "pending") {
    return (
      <div className="admin-actions">
        <Button variant="bank" onClick={() => onNumberStatus("accepted")}>
          <Check /> قبول الرمز
        </Button>
        <Button variant="outline" onClick={() => onNumberStatus("rejected")}>
          <X /> رفض الرمز
        </Button>
        <Button variant="outline" onClick={onDelete}>
          <Trash2 /> حذف
        </Button>
      </div>
    );
  }

  return (
    <div className="admin-actions">
      <Button variant="outline" onClick={onDelete}>
        <Trash2 /> حذف
      </Button>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <article className="admin-stat">
      <span>{icon}</span>
      <div>
        <strong>{value}</strong>
        <p>{label}</p>
      </div>
    </article>
  );
}
