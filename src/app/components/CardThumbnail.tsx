import Image from "next/image";

/**
 * The screenshot band at the top of a vibe card.
 *
 * This exists because the band had been hand-copied into three places —
 * ProjectCard (the /vibes grid), the home page spotlight, and the home page
 * "Trending Vibe" grid — and the copies had drifted on every single property:
 *
 *   image opacity   75%            90%              80%
 *   scrim           from-foreground from-background  from-background
 *   hover zoom      scale-[1.03]   scale-105        scale-105
 *   image ground    bg-background  bg-card-border   bg-card-border
 *
 * Three treatments of the same screenshot on the same site, and a fix applied
 * to one of them reached neither of the others.
 *
 * The treatment kept here is no dim and no scrim. /vibes is a showcase and the
 * screenshot IS the entry, so dimming it to 75-90% under an ink or paper
 * gradient spent the page's own content on decoration that carried nothing:
 * in all three copies the title, description and metadata sit in the card body
 * below the image, and any control over the image (upvote, delete) has its own
 * solid fill. The one place a scrim is legitimate is the detail page hero,
 * where it backs a white <h1> laid over the image; that one is deliberately
 * not built on this component.
 *
 * Separation from the card body is a hairline, per DESIGN.md ("hairline
 * borders carry all structure", "Flat by default").
 *
 * No hooks and no "use client": this renders inside both the server-rendered
 * home page and the client-side ProjectCard.
 */
export interface CardThumbnailProps {
  src: string;
  /** Normally the entry's title. */
  alt: string;
  /** Height utility for the band, e.g. "h-44". Grid density differs per surface. */
  heightClass: string;
  /** next/image `sizes`, which differs per surface because the grids differ. */
  sizes: string;
  priority?: boolean;
  /** Optional corner label, e.g. "Showcase". Sits above the image. */
  badge?: string;
  /** Rendered above the image at z-20, for controls like upvote/delete. */
  children?: React.ReactNode;
}

export function CardThumbnail({
  src,
  alt,
  heightClass,
  sizes,
  priority = false,
  badge,
  children,
}: CardThumbnailProps) {
  return (
    <div
      className={`${heightClass} relative bg-background overflow-hidden border-b border-card-border`}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover group-hover:scale-[1.03] transition duration-500"
      />
      {badge && (
        <span className="absolute bottom-3 left-3 z-20 px-2 py-0.5 rounded text-xs font-semibold bg-background text-text-secondary border border-card-border">
          {badge}
        </span>
      )}
      {children}
    </div>
  );
}
