// The Sketchboard mark: a small sticky note with a folded corner.
export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#4F46E5" />
      <path d="M8 9.5A1.5 1.5 0 019.5 8h13A1.5 1.5 0 0124 9.5V19l-5 5H9.5A1.5 1.5 0 018 22.5z" fill="#FFD43B" />
      <path d="M24 19l-5 5v-3.5A1.5 1.5 0 0120.5 19z" fill="#E8B923" />
    </svg>
  );
}
