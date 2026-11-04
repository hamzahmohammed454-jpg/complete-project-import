export type AnnouncementWindow = { active: boolean; starts_at: string; ends_at: string | null };

export function announcementIsCurrent(row: AnnouncementWindow, now: Date): boolean {
  return row.active && new Date(row.starts_at).getTime() <= now.getTime() &&
    (row.ends_at === null || new Date(row.ends_at).getTime() > now.getTime());
}