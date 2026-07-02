import {
  Atom,
  Layers,
  Palette,
  Bot,
  Database,
  Megaphone,
  ShieldCheck,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

// Maps the icon names stored in src/lib/skillCategories.ts to lucide
// components. Kept out of that module so it stays pure data (cheap to import
// from the sitemap, API routes, and server pages without pulling icon
// components into them). Unresolved names fall back to Sparkles.
const ICONS: Record<string, LucideIcon> = {
  Atom,
  Layers,
  Palette,
  Bot,
  Database,
  Megaphone,
  ShieldCheck,
  Search,
};

export function TopicIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Sparkles;
  return <Icon className={className} aria-hidden="true" />;
}
