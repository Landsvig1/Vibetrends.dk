import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles, Layers, Briefcase, MessageSquare, PlusCircle, Terminal, Cpu } from "lucide-react";
import { entityMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  return entityMetadata({
    title: "Om vibetrends.dk",
    description: "Hvad vibetrends.dk er, og hvordan du bruger det: et dansk samlingssted for AI-byggeres projekter, tools og agent-skills.",
    path: "/about",
    lang: "da",
  });
}

export default async function AboutPage() {
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
          vibetrends.dk er samlingsstedet hvor danske AI-byggere viser hvad de
          bygger, finder kuraterede skills til deres agent, og diskuterer hvad
          der virker i praksis.
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
                <strong className="text-foreground">Vibes</strong>: et showcase af rigtige projekter fra fællesskabet, med værktøjer og prompts bag.
              </span>
            </li>
            <li className="flex gap-3">
              <Briefcase className="h-5 w-5 text-accent-primary shrink-0 mt-0.5" />
              <span>
                <strong className="text-foreground">Skills</strong>: et kurateret katalog af skills, MCP-servere og CLI-værktøjer du kan koble direkte på Claude Code, Cursor eller Gemini CLI for at gøre dem mere kapable.
              </span>
            </li>
            <li className="flex gap-3">
              <MessageSquare className="h-5 w-5 text-accent-primary shrink-0 mt-0.5" />
              <span>
                <strong className="text-foreground">Forum</strong>: dansksproget diskussion om hvad der virker (og ikke virker) når man bygger med AI.
              </span>
            </li>
            <li className="flex gap-3">
              <Cpu className="h-5 w-5 text-accent-primary shrink-0 mt-0.5" />
              <span>
                <strong className="text-foreground">Blog</strong>: dybdegående guides og gennemgange til når en tråd ikke er nok.
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
              Browse <Link href="/skills" className="text-accent-primary hover:underline">Skills</Link>, find noget der passer, og brug dets connect-knap til at få det ind i Claude Code, Cursor eller Gemini CLI: helt uden manuel opsætning.
            </li>
            <li>
              <strong className="text-foreground">Har du bygget noget?</strong>{" "}
              Indsend det til Vibes, eller indsend en skill du har skrevet til kataloget. Begge dele er community-bidraget og kurateret, ikke auto-scrapet.
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
            derude. vibetrends.dk prøver ikke at overgå dem på antal: vi
            satser på to ting en stor directory ikke nemt kan, nemlig kuratering og
            forbindelse. Hver eneste entry her er valgt, ikke scrapet, og
            hver af dem er tænkt til at være ét skridt fra faktisk at lande i
            din agent: ikke bare endnu en fane du bogmærker og glemmer.
          </p>
          <p>
            Det er også et sted for danske byggere at tale
            sammen på dansk om det de bygger: en niche en global platform
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
