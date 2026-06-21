import {
  Atom,
  Triangle,
  Palette,
  Smartphone,
  Bot,
  Database,
  FlaskConical,
  Megaphone,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

// Maps the icon names stored in src/lib/topics.ts to lucide components. Kept out
// of topics.ts so that module stays pure data (cheap to import from the sitemap,
// API routes, and server pages without pulling icon components into them).
const ICONS: Record<string, LucideIcon> = {
  Atom,
  Triangle,
  Palette,
  Smartphone,
  Bot,
  Database,
  FlaskConical,
  Megaphone,
};

export function TopicIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Sparkles;
  return <Icon className={className} aria-hidden="true" />;
}
