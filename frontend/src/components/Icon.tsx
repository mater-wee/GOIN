import type { LucideIcon } from "lucide-react";

/** Decorative outline icon. Every lucide icon in the app is rendered through this wrapper. */
export function Icon({
  icon: C,
  size = 18,
  strong = false,
  className,
}: {
  icon: LucideIcon;
  size?: 14 | 16 | 18 | 22;
  strong?: boolean;
  className?: string;
}) {
  return (
    <C
      size={size}
      strokeWidth={strong ? 2.5 : 1.75}
      aria-hidden="true"
      focusable="false"
      className={className ? `icon ${className}` : "icon"}
    />
  );
}
