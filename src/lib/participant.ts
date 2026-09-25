"use client";
// Anonymous participant id: a random UUID kept in localStorage. No personal data.
const KEY = "stamp_participant_id";
export function getParticipantId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(KEY, id);
  }
  return id;
}
