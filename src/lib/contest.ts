import { getSupabaseClient } from "@/lib/supabase";

export type ContestStatus = "pending" | "accepted" | "rejected";
export type CouponReviewStatus = "not_submitted" | "pending" | "accepted" | "rejected";

export type ContestSubmission = {
  id: string;
  ownerUid: string;
  participantNumber: string;
  couponReference: string;
  couponCode: string;
  status: ContestStatus;
  couponStatus?: CouponReviewStatus;
  createdAt: string;
};

type SubmissionRow = {
  id: string;
  owner_uid: string;
  participant_number: string;
  coupon_reference: string;
  coupon_code: string;
  status: ContestStatus;
  coupon_status: CouponReviewStatus;
  created_at: string;
};

export const CURRENT_SUBMISSION_KEY = "university-demo-current-submission-v1";
export const SUBMISSION_REJECTED_KEY = "university-demo-submission-rejected-v1";
const TABLE_NAME = "demo_submissions";

function toSubmission(row: SubmissionRow): ContestSubmission {
  return {
    id: row.id,
    ownerUid: row.owner_uid,
    participantNumber: row.participant_number,
    couponReference: row.coupon_reference,
    couponCode: row.coupon_code,
    status: row.status,
    couponStatus: row.coupon_status,
    createdAt: row.created_at,
  };
}

export async function createSubmission(submission: ContestSubmission) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from(TABLE_NAME).insert({
    id: submission.id,
    owner_uid: submission.ownerUid,
    participant_number: submission.participantNumber,
    coupon_reference: submission.couponReference,
    coupon_code: submission.couponCode,
    coupon_status: submission.couponStatus ?? "not_submitted",
    status: submission.status,
    created_at: submission.createdAt,
  });
  if (error) throw new Error(error.message);
}

export async function updateSubmissionStatus(id: string, status: ContestStatus) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from(TABLE_NAME).update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateSubmissionCouponCode(id: string, couponCode: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from(TABLE_NAME).update({
    coupon_code: couponCode,
    coupon_status: "pending",
  }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteSubmission(id: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from(TABLE_NAME).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateSubmissionCouponStatus(
  id: string,
  couponStatus: "accepted" | "rejected",
) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from(TABLE_NAME).update({ coupon_status: couponStatus }).eq("id", id);
  if (error) throw new Error(error.message);
}

export function watchSubmission(
  id: string,
  onChange: (submission: ContestSubmission | null) => void,
  onError?: (error: Error) => void,
): () => void {
  const supabase = getSupabaseClient();
  const channel = supabase
    .channel(`submission-${id}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: TABLE_NAME,
      filter: `id=eq.${id}`,
    }, (payload) => {
      if (payload.eventType === "DELETE") onChange(null);
      else onChange(toSubmission(payload.new as SubmissionRow));
    })
    .subscribe((status, error) => {
      if (status === "CHANNEL_ERROR") onError?.(error ?? new Error("تعذر الاشتراك في تحديث الطلب."));
    });

  void supabase.from(TABLE_NAME).select("*").eq("id", id).maybeSingle().then(({ data, error }) => {
    if (error) onError?.(new Error(error.message));
    else onChange(data ? toSubmission(data as SubmissionRow) : null);
  });

  return () => { void channel.unsubscribe(); };
}

export function watchSubmissions(
  onChange: (submissions: ContestSubmission[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const supabase = getSupabaseClient();
  const load = async () => {
    const { data, error } = await supabase.from(TABLE_NAME).select("*").order("created_at", { ascending: false });
    if (error) onError?.(new Error(error.message));
    else onChange((data ?? []).map((row) => toSubmission(row as SubmissionRow)));
  };
  void load();

  const channel = supabase
    .channel("all-demo-submissions")
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: TABLE_NAME,
    }, () => { void load(); })
    .subscribe((status, error) => {
      if (status === "CHANNEL_ERROR") onError?.(error ?? new Error("تعذر الاشتراك في تحديث الطلبات."));
    });

  return () => { void channel.unsubscribe(); };
}
