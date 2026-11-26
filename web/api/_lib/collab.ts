import type { ActivityRec, BoardRec, NotificationRec, TeamRec } from "./types.js";

// Who may do what on a board. The owner can do everything; a member is an "editor" or a "viewer".
export type BoardRole = "owner" | "editor" | "viewer";
export const MAX_MEMBERS = 50;
export const MAX_INVITES = 50;
const RANK: Record<BoardRole, number> = { viewer: 1, editor: 2, owner: 3 };

export const MAX_TEAMS = 10; // teams one person may belong to
export const MAX_TEAM_MEMBERS = 50;

// What a team gives you on its boards: admins can do everything, members can edit.
export function teamRoleOf(team: TeamRec | null | undefined, userId: string): BoardRole | null {
  const m = team?.members.find((x) => x.userId === userId);
  return m ? (m.role === "admin" ? "owner" : "editor") : null;
}

// Your right on a board: the best of what you have as owner, as a named member, and through the board's team.
export function roleOf(board: BoardRec, userId: string, team?: TeamRec | null): BoardRole | null {
  const own: BoardRole | null = board.ownerId === userId ? "owner" : board.members?.find((m) => m.userId === userId)?.role ?? null;
  const viaTeam = board.teamId && team && team.id === board.teamId ? teamRoleOf(team, userId) : null;
  if (!own) return viaTeam;
  if (!viaTeam) return own;
  return atLeast(own, viaTeam) ? own : viaTeam;
}
export const atLeast = (role: BoardRole | null, min: BoardRole): boolean => !!role && RANK[role] >= RANK[min];

// newest first, and the lists never grow without limit
export const addActivity = (list: ActivityRec[] | undefined, by: string, text: string, at = Date.now()): ActivityRec[] =>
  [{ at, by: by.slice(0, 60), text: text.slice(0, 200) }, ...(list ?? [])].slice(0, 100);

export const addNotification = (list: NotificationRec[] | undefined, n: Omit<NotificationRec, "read">): NotificationRec[] =>
  [{ ...n, read: false }, ...(list ?? [])].slice(0, 50);

// "@maya" or "@Maya Khan" in a comment: compare names without spaces, capitals or punctuation.
export const handleOf = (name: string) => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

// Which people does a list of @handles point to? A handle matches a whole name ("mayakhan") or a first name ("maya")
// only when that first name belongs to exactly one person on the board (otherwise it would be a guess).
export function findMentioned(handles: string[], people: { id: string; name: string }[]): string[] {
  const out = new Set<string>();
  for (const raw of handles) {
    const h = handleOf(raw);
    if (!h) continue;
    const whole = people.filter((p) => handleOf(p.name) === h);
    if (whole.length === 1) {
      out.add(whole[0].id);
      continue;
    }
    const first = people.filter((p) => handleOf(p.name.split(/\s+/)[0] ?? "") === h);
    if (first.length === 1) out.add(first[0].id);
  }
  return [...out];
}
