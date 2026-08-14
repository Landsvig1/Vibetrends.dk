import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Cpu, Layers, Briefcase } from "lucide-react";
import { ProjectCard } from "./components/ProjectCard";
import { SkillCard } from "./components/SkillCard";
import { AgentCard } from "./components/AgentCard";
import { getTopProjects, getTopSkills, getTopAgents, getTopMcpServers } from "@/lib/db";

export default function Home() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-text-secondary font-semibold">Indlæser…</div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  // One live top-N query per catalog section. There is deliberately no
  // hand-picked spotlight row: the previous one pinned three literal row IDs
  // in this file, which on a solo-maintained catalog is a guaranteed staleness
  // source, and it duplicated the grids below it hard enough that those grids
  // had to filter the spotlighted items back out to avoid rendering the same
  // card twice. If an editorial pick is wanted again, it belongs in a column
  // on the row, not in JSX.
  const [projects, skills, [topCli], [topMcp]] = await Promise.all([
    getTopProjects(3, 'da'),
    getTopSkills(3, 'da'),
    getTopAgents(1, 'da'),
    getTopMcpServers(1, 'da'),
  ]);

  const agentTools = [
    topCli && { agent: topCli, base: "/cli", testId: "cli-card" as const },
    topMcp && { agent: topMcp, base: "/mcp", testId: "mcp-card" as const },
  ].filter((t) => t !== null && t !== undefined);

  return (
    <div className="space-y-12 sm:space-y-14">
      {/* The hero states what the site is and offers one way in. It used to
          carry three buttons and two text links, of which "Indsend dit projekt"
          duplicated the header's primary CTA and "Hvad er vibetrends.dk?"
          duplicated the footer — five choices before a visitor had seen a
          single catalog entry. The whole block was also `hidden sm:flex`, so
          mobile got no call to action at all. */}
      <section className="text-center pt-2 pb-1 sm:pt-4 sm:pb-2">
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight max-w-4xl mx-auto leading-tight sm:leading-none">
          {/* pe-[0.08em]: the italic's final glyph overhangs its advance box and
              crowds the following roman word — tracking-tight leaves only ~5.5px
              of space at 36px, so the words collide when the line wraps here. */}
          Gode AI-tools. <span className="text-accent-primary italic pe-[0.08em]">Selv agenter</span> henter dem her.
        </h1>

        <p className="mt-4 text-lg text-text-secondary max-w-2xl mx-auto">
          Skills, MCP-servere og CLI-tools der virker. Verdens bedste, plus dem kun Danmark har.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {/* inline-flex, not the bare .btn-primary: that class sets no display,
              so the trailing icon wrapped onto its own line inside the pill. */}
          <Link href="/skills" className="btn-primary inline-flex items-center whitespace-nowrap">
            Udforsk tools
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Link>
          {/* Addressed to the human, not the agent. "Er du en AI-agent? Start
              her" spoke past the person reading it: the decision being made on
              this page is whether to hand the URL to an agent, and that is a
              human's call. */}
          <Link
            href="/agent-guide"
            className="inline-flex items-center text-sm text-text-secondary hover:text-accent-primary transition-colors"
          >
            <Cpu className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Kobl kataloget på din agent →
          </Link>
        </div>
      </section>

      {projects.length > 0 && (
        <section className="space-y-4">
          <SectionHeading icon={<Layers className="mr-2 h-5 w-5 text-accent-primary" />} href="/vibes" linkLabel="Se alle vibes">
            Bygget i Danmark
          </SectionHeading>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {projects.map((project, i) => (
              <ProjectCard
                key={project.id}
                project={project}
                isPriority={i === 0}
                demoLabel="Se live"
              />
            ))}
          </div>
        </section>
      )}

      {skills.length > 0 && (
        <section className="space-y-4">
          <SectionHeading icon={<Briefcase className="mr-2 h-5 w-5 text-accent-primary" />} href="/skills" linkLabel="Se alle skills">
            Skills til din agent
          </SectionHeading>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {skills.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                githubLabel="Se på GitHub"
                connectLabel="Forbind"
              />
            ))}
          </div>
        </section>
      )}

      {agentTools.length > 0 && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <h2 className="text-xl font-bold flex items-center">
              <Cpu className="mr-2 h-5 w-5 text-accent-primary" aria-hidden="true" />
              CLI-tools og MCP-servere
            </h2>
            {/* Two destinations, so the section heading can't carry a single
                "Se alle" the way the others do. */}
            <div className="flex items-center gap-4 text-sm font-medium">
              <Link href="/cli" className="text-accent-primary hover:opacity-80 flex items-center">
                Se alle CLI
                <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
              </Link>
              <Link href="/mcp" className="text-accent-primary hover:opacity-80 flex items-center">
                Se alle MCP
                <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {agentTools.map(({ agent, base, testId }) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                detailBase={base}
                testId={testId}
                sourceLabel={`${agent.name} — kilde`}
                byLabel="Af"
                detailsLabel="Se detaljer"
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SectionHeading({
  icon,
  href,
  linkLabel,
  children,
}: {
  icon: React.ReactNode;
  href: string;
  linkLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <h2 className="text-xl font-bold flex items-center">
        {icon}
        {children}
      </h2>
      <Link href={href} className="text-sm text-accent-primary hover:opacity-80 flex items-center font-medium">
        {linkLabel}
        <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
