import type { User } from "../api";

// The person's picture (from Google) or, when there is none, the first letter of their name.
export default function Avatar({ user, size = 36 }: { user: Pick<User, "name" | "avatar">; size?: number }) {
  const initial = user.name.trim().charAt(0).toUpperCase() || "?";
  return user.avatar ? (
    <img src={user.avatar} alt="" width={size} height={size} referrerPolicy="no-referrer" className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="flex items-center justify-center rounded-full bg-brand font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden>
      {initial}
    </span>
  );
}
