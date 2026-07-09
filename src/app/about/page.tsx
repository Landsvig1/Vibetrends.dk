import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Sparkles, Layers, Briefcase, MessageSquare, PlusCircle, Terminal, Cpu } from "lucide-react";
import { Language } from "@/lib/translations";
import { entityMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";
  return entityMetadata({
    title: lang === "da" ? "Om vibetrends.dk" : "About vibetrends.dk",
    description:
      lang === "da"
        ? "Hvad vibetrends.dk er, hvordan du bruger det, og hvorfor det findes — det danske community for vibe-kodede projekter, AI-tools og agent-skills."
        : "What vibetrends.dk is, how to use it, and why it exists — the Danish community for vibe-coded projects, AI tools, and agent skills.",
    path: "/about",
    lang,
  });
}

export default async function AboutPage() {
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";

  if (lang === "en") {
    return (
      <div className="max-w-3xl mx-auto space-y-16 py-8">
        <div className="text-center space-y-4">
          <div className="pill-badge mx-auto">
            <Sparkles className="h-3.5 w-3.5 text-accent-primary" />
            <span>About vibetrends.dk</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
            A Danish home for people building with AI
          </h1>
          <p className="text-text-secondary text-lg max-w-2xl mx-auto">
            vibetrends.dk is where the Danish vibe-coding community shows what
            it&apos;s building, finds curated skills for their coding agent, and
            talks through what actually works.
          </p>
        </div>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-foreground">What this is</h2>
          <div className="text-text-secondary leading-relaxed space-y-4">
            <p>
              Most AI/dev content lives scattered across Twitter threads,
              Discord servers, and GitHub READMEs that never surface when you
              need them. vibetrends.dk pulls the useful parts into one place,
              organized around four things:
            </p>
            <ul className="space-y-3 pl-1">
              <li className="flex gap-3">
                <Layers className="h-5 w-5 text-accent-primary shrink-0 mt-0.5" />
                <span>
                  <strong className="text-foreground">Vibes</strong> — a showcase of real projects people have vibe-coded, with the tools and prompts behind them.
                </span>
              </li>
              <li className="flex gap-3">
                <Briefcase className="h-5 w-5 text-accent-primary shrink-0 mt-0.5" />
                <span>
                  <strong className="text-foreground">Skills</strong> — a curated catalog of skills, MCP servers, and CLI tools you can plug directly into Claude Code, Cursor, or Gemini CLI to make them more capable.
                </span>
              </li>
              <li className="flex gap-3">
                <MessageSquare className="h-5 w-5 text-accent-primary shrink-0 mt-0.5" />
                <span>
                  <strong className="text-foreground">Forum</strong> — Danish-language discussion about what&apos;s actually working (and what isn&apos;t) when building with AI.
                </span>
              </li>
              <li className="flex gap-3">
                <Cpu className="h-5 w-5 text-accent-primary shrink-0 mt-0.5" />
                <span>
                  <strong className="text-foreground">Blog</strong> — longer guides and write-ups for when a thread isn&apos;t enough.
                </span>
              </li>
            </ul>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-foreground">How to use it</h2>
          <div className="text-text-secondary leading-relaxed space-y-4">
            <p>
              There&apos;s no signup wall to browse. Start wherever matches what
              you&apos;re after:
            </p>
            <ol className="space-y-3 pl-1 list-decimal list-inside marker:text-accent-primary marker:font-bold">
              <li>
                <strong className="text-foreground">Looking for inspiration?</strong>{" "}
                Browse <Link href="/vibes" className="text-accent-primary hover:underline">Vibes</Link> to see what other people have shipped, and how they built it.
              </li>
              <li>
                <strong className="text-foreground">Want to extend your coding agent?</strong>{" "}
                Browse <Link href="/skills" className="text-accent-primary hover:underline">Skills</Link>, find something that fits, and use its one-step connect action to get it into Claude Code, Cursor, or Gemini CLI — no manual setup.
              </li>
              <li>
                <strong className="text-foreground">Built something?</strong>{" "}
                Submit it to Vibes, or submit a skill you&apos;ve written to the catalog — both are community-contributed, curated, not auto-scraped.
              </li>
              <li>
                <strong className="text-foreground">Stuck on something?</strong>{" "}
                Post in the <Link href="/forum" className="text-accent-primary hover:underline">Forum</Link>. It&apos;s small enough that real answers, not noise, are the norm.
              </li>
            </ol>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-foreground">Why it exists</h2>
          <div className="text-text-secondary leading-relaxed space-y-4">
            <p>
              There are much bigger, English-language skill directories out
              there. vibetrends.dk isn&apos;t trying to out-list them — it&apos;s
              betting on two things a big directory can&apos;t easily do:
              curation and connectability. Every catalog entry here was
              chosen, not scraped, and every one of them is meant to be one
              step away from actually landing in your agent, not just another
              tab you bookmark and forget.
            </p>
            <p>
              It&apos;s also, plainly, a place for Danish builders to talk to
              each other in Danish about what they&apos;re building — a niche
              a global platform doesn&apos;t serve well.
            </p>
          </div>
        </section>

        <div className="flex flex-wrap justify-center gap-4 pt-4">
          <Link href="/vibes" className="btn-primary">
            See Showcase
            <Layers className="ml-2 h-4 w-4" />
          </Link>
          <Link href="/skills" className="btn-secondary">
            Browse Skills
            <Terminal className="ml-2 h-4 w-4" />
          </Link>
          <Link href="/vibes?submit=1" className="btn-secondary">
            Submit your project
            <PlusCircle className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-16 py-8">
      <div className="text-center space-y-4">
        <div className="pill-badge mx-auto">
          <Sparkles className="h-3.5 w-3.5 text-accent-primary" />
          <span>Om vibetrends.dk</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
          Et dansk hjem for dem der bygger med AI
        </h1>
        <p className="text-text-secondary text-lg max-w-2xl mx-auto">
          vibetrends.dk er stedet hvor det danske vibe-coding community viser
          hvad de bygger, finder kuraterede skills til deres coding agent, og
          diskuterer hvad der faktisk virker.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground">Hvad det her er</h2>
        <div className="text-text-secondary leading-relaxed space-y-4">
          <p>
            Det meste AI/dev-indhold ligger spredt i Twitter-tråde,
            Discord-servere og GitHub READMEs, som aldrig dukker op igen når
            du faktisk har brug for dem. vibetrends.dk samler det brugbare ét
            sted, organiseret omkring fire ting:
          </p>
          <ul className="space-y-3 pl-1">
            <li className="flex gap-3">
              <Layers className="h-5 w-5 text-accent-primary shrink-0 mt-0.5" />
              <span>
                <strong className="text-foreground">Vibes</strong> — et showcase af rigtige projekter folk har vibe-kodet, med værktøjerne og prompts bag.
              </span>
            </li>
            <li className="flex gap-3">
              <Briefcase className="h-5 w-5 text-accent-primary shrink-0 mt-0.5" />
              <span>
                <strong className="text-foreground">Skills</strong> — et kurateret katalog af skills, MCP-servere og CLI-værktøjer du kan koble direkte på Claude Code, Cursor eller Gemini CLI for at gøre dem mere kapable.
              </span>
            </li>
            <li className="flex gap-3">
              <MessageSquare className="h-5 w-5 text-accent-primary shrink-0 mt-0.5" />
              <span>
                <strong className="text-foreground">Forum</strong> — dansksproget diskussion om hvad der faktisk virker (og ikke virker) når man bygger med AI.
              </span>
            </li>
            <li className="flex gap-3">
              <Cpu className="h-5 w-5 text-accent-primary shrink-0 mt-0.5" />
              <span>
                <strong className="text-foreground">Blog</strong> — længere guides og gennemgange til når en tråd ikke er nok.
              </span>
            </li>
          </ul>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground">Sådan bruger du det</h2>
        <div className="text-text-secondary leading-relaxed space-y-4">
          <p>
            Der er ingen login-mur for at browse. Start hvor det matcher det
            du leder efter:
          </p>
          <ol className="space-y-3 pl-1 list-decimal list-inside marker:text-accent-primary marker:font-bold">
            <li>
              <strong className="text-foreground">Leder du efter inspiration?</strong>{" "}
              Browse <Link href="/vibes" className="text-accent-primary hover:underline">Vibes</Link> for at se hvad andre har lavet, og hvordan de byggede det.
            </li>
            <li>
              <strong className="text-foreground">Vil du udvide din coding agent?</strong>{" "}
              Browse <Link href="/skills" className="text-accent-primary hover:underline">Skills</Link>, find noget der passer, og brug dets connect-knap til at få det ind i Claude Code, Cursor eller Gemini CLI — uden manuel opsætning.
            </li>
            <li>
              <strong className="text-foreground">Har du bygget noget?</strong>{" "}
              Indsend det til Vibes, eller indsend en skill du har skrevet til kataloget — begge dele er community-bidraget, kurateret, ikke auto-scrapet.
            </li>
            <li>
              <strong className="text-foreground">Sidder du fast?</strong>{" "}
              Skriv i <Link href="/forum" className="text-accent-primary hover:underline">Forummet</Link>. Det er lille nok til at rigtige svar, ikke støj, er normen.
            </li>
          </ol>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground">Hvorfor det findes</h2>
        <div className="text-text-secondary leading-relaxed space-y-4">
          <p>
            Der findes langt større, engelsksprogede skill-directories
            derude. vibetrends.dk prøver ikke at overgå dem på antal — vi
            satser på to ting en stor directory ikke nemt kan: kuratering og
            forbindelse. Hver eneste entry her er valgt, ikke scrapet, og
            hver af dem er tænkt til at være ét skridt fra faktisk at lande i
            din agent — ikke bare endnu en fane du bogmærker og glemmer.
          </p>
          <p>
            Det er også, helt enkelt, et sted for danske byggere at tale
            sammen på dansk om det de bygger — en niche en global platform
            ikke betjener godt.
          </p>
        </div>
      </section>

      <div className="flex flex-wrap justify-center gap-4 pt-4">
        <Link href="/vibes" className="btn-primary">
          Se Showcase
          <Layers className="ml-2 h-4 w-4" />
        </Link>
        <Link href="/skills" className="btn-secondary">
          Se Skills
          <Terminal className="ml-2 h-4 w-4" />
        </Link>
        <Link href="/vibes?submit=1" className="btn-secondary">
          Indsend dit projekt
          <PlusCircle className="ml-2 h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
