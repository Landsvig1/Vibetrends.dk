import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Brugervilkår",
  description: "Brugervilkår og ansvarsfraskrivelse for vibetrends.dk.",
};

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-8 py-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">
          Brugervilkår for <span className="text-violet-400">vibetrends.dk</span>
        </h1>
        <p className="text-slate-400 text-sm">Sidst opdateret: 14. juni 2026</p>
      </div>

      <div className="prose prose-invert text-slate-300 space-y-6 text-sm leading-relaxed">
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-white">1. Platformens formål</h2>
          <p>
            Vibetrends.dk fungerer som et uafhængigt udstillingsvindue (showcase), diskussionsforum og uforpligtende markedsplads for AI-udvikling og &quot;vibe coding&quot;. Formålet er at fremme deling af viden, prompts, eksempler og formidle kontakt mellem freelance AI-specialister og potentielle kunder.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-white">2. Ansvarsfraskrivelse</h2>
          <p>
            Al interaktion, aftaleindgåelse og handel, der foregår som følge af kontakt formidlet gennem vibetrends.dk, sker udelukkende mellem dig og den pågældende konsulent/specialist.
          </p>
          <p>
            Vibetrends.dk og Kasper Landsvig (aiauto.dk) påtager sig intet ansvar for kvaliteten, leverancen, lovligheden eller eventuelle tab og skader opstået i forbindelse med ydelser leveret af konsulenter opført på denne platform.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-white">3. Indhold på platformen</h2>
          <p>
            Brugere er selv ansvarlige for det indhold, de indsender til Showcase, Forum eller andre steder på platformen. Det er strengt forbudt at indsende materiale, der krænker andres ophavsret, varemærker eller fortrolighedsaftaler.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-white">4. Ændring af vilkår</h2>
          <p>
            Vi forbeholder os retten til løbende at ændre eller opdatere disse brugervilkår uden forudgående varsel. Det er dit eget ansvar at holde dig opdateret med de gældende vilkår.
          </p>
        </section>
      </div>
    </div>
  );
}
