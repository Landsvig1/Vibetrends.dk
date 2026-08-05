import { FileText, ExternalLink } from "lucide-react";
import { getSkillDoc } from "@/lib/db";
import { renderSkillDocHtml } from "@/lib/skillDocMarkdown";

/**
 * Renders the skill's own SKILL.md / README.md, pulled from its source repo by
 * scripts/refresh-skill-docs.mjs and stored on the row.
 *
 * This is other people's writing, so it is framed as such: the heading names the
 * file, and every path out of the block goes to the upstream repo rather than
 * presenting the text as ours.
 *
 * Renders nothing at all when there is no doc — the skill may have no
 * github_url, its repo may have neither file, or it may never have been
 * refreshed. All three are normal.
 */
export default async function SkillDocSection({ id }: { id: string }) {
  const doc = await getSkillDoc(id);
  if (!doc) return null;

  const html = renderSkillDocHtml(doc.markdown, doc.sourceUrl);
  if (!html.trim()) return null;

  return (
    <section className="p-8 rounded-2xl glass-panel border border-card-border space-y-5 shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-card-border">
        <h2 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center">
          <FileText className="h-4 w-4 mr-2 text-accent-primary" />
          Dokumentation
        </h2>
        <a
          href={doc.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-text-secondary hover:text-accent-primary transition-colors"
        >
          {doc.path || "source"}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <p className="text-xs text-text-secondary">
        Nedenstående er skillens egen dokumentation, hentet fra kildekoderepoet. Ophavsret tilhører forfatteren.
      </p>

      {/* Sanitized in renderSkillDocHtml: an allowlist of tags, no <img>, no
          inline event handlers, and every link rewritten to an absolute
          nofollow/noopener external link. */}
      <div className="skill-doc" dangerouslySetInnerHTML={{ __html: html }} />

      {doc.truncated && (
        <p className="text-xs text-text-secondary pt-4 border-t border-card-border">
          Dokumentationen er forkortet.{" "}
          <a
            href={doc.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-primary underline underline-offset-2"
          >
            Læs den fulde version på GitHub
          </a>
          .
        </p>
      )}
    </section>
  );
}
