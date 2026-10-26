import { getSupabaseClient } from "@/lib/supabase";

export type ClientTracking = {
  sessionId: string;
  currentPage: "main" | "verify" | "waiting" | "accepted" | "rejected";
  status: string;
  participantNumber: string | null;
  submissionId: string | null;
  lastSeenAt: string;
};

const TABLE_NAME = "client_tracking";

type TrackingRow = {
  session_id: string;
  current_page: ClientTracking["currentPage"];
  status: string;
  participant_number: string | null;
  submission_id: string | null;
  last_seen_at: string;
};

function toTracking(row: TrackingRow): ClientTracking {
  return {
    sessionId: row.session_id,
    currentPage: row.current_page,
    status: row.status,
    participantNumber: row.participant_number,
    submissionId: row.submission_id,
    lastSeenAt: row.last_seen_at,
  };
}

export async function upsertClientTracking(input: Omit<ClientTracking, "lastSeenAt">) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from(TABLE_NAME).upsert({
    session_id: input.sessionId,
    current_page: input.currentPage,
    status: input.status,
    participant_number: input.participantNumber,
    submission_id: input.submissionId,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "session_id" });
  if (error) throw new Error(error.message);
}

export function watchClientTracking(
  onChange: (clients: ClientTracking[]) => void,
  onError?: (error: Error) => void,
) {
  const supabase = getSupabaseClient();
  const load = async () => {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select("*")
      .order("last_seen_at", { ascending: false });
    if (error) onError?.(new Error(error.message));
    else onChange((data ?? []).map((row) => toTracking(row as TrackingRow)));
  };
  void load();

  const channel = supabase
    .channel("client-tracking-live")
    .on("postgres_changes", { event: "*", schema: "public", table: TABLE_NAME }, () => void load())
    .subscribe((status, error) => {
      if (status === "CHANNEL_ERROR") onError?.(error ?? new Error("تعذر الاشتراك في تتبع العملاء."));
    });

  return () => { void channel.unsubscribe(); };
}
