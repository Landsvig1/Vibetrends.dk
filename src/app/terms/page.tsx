import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Language } from "@/lib/translations";

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";
  return {
    title: lang === "da" ? "Brugervilkår" : "Terms of Service",
    description: lang === "da"
      ? "Brugervilkår og ansvarsfraskrivelse for vibetrends.dk."
      : "Terms of service and disclaimer for vibetrends.dk.",
  };
}

export default async function TermsPage() {
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";

  if (lang === "en") {
    return (
      <div className="max-w-3xl mx-auto space-y-8 py-8">
        <div className="space-y-4">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
            Terms of Service for <span className="text-accent-primary">vibetrends.dk</span>
          </h1>
          <p className="text-text-secondary text-sm">Last updated: June 16, 2026</p>
        </div>

        <div className="prose prose-invert text-text-secondary space-y-6 text-sm leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground">1. Purpose of the Platform</h2>
            <p>
              Vibetrends.dk functions as an independent showcase, discussion forum, and non-binding marketplace for AI development and &quot;vibe coding&quot;. The purpose is to promote sharing of knowledge, prompts, examples, and facilitate contact between freelance AI specialists and potential clients.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground">2. Disclaimer</h2>
            <p>
              All interaction, agreements, and trade occurring as a result of contact facilitated through vibetrends.dk take place solely between you and the respective consultant/specialist.
            </p>
            <p>
              Vibetrends.dk and Kasper Landsvig (aiauto.dk) assume no responsibility for the quality, delivery, legality, or any losses and damages arising in connection with services provided by consultants listed on this platform.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground">3. Content on the Platform</h2>
            <p>
              Users are solely responsible for the content they submit to the Showcase, Forum, or elsewhere on the platform. It is strictly forbidden to submit material that infringes on others&apos; copyrights, trademarks, or confidentiality agreements.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground">4. Changes to Terms</h2>
            <p>
              We reserve the right to continuously change or update these terms of service without prior notice. It is your own responsibility to stay updated with the current terms.
            </p>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 py-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
          Brugervilkår for <span className="text-accent-primary">vibetrends.dk</span>
        </h1>
        <p className="text-text-secondary text-sm">Sidst opdateret: 16. juni 2026</p>
      </div>

      <div className="prose prose-invert text-text-secondary space-y-6 text-sm leading-relaxed">
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-foreground">1. Platformens formål</h2>
          <p>
            Vibetrends.dk fungerer som et uafhængigt udstillingsvindue (showcase), diskussionsforum og uforpligtende markedsplads for AI-udvikling og &quot;vibe coding&quot;. Formålet er at fremme deling af viden, prompts, eksempler og formidle kontakt mellem freelance AI-specialister og potentielle kunder.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-foreground">2. Ansvarsfraskrivelse</h2>
          <p>
            Al interaktion, aftaleindgåelse og handel, der foregår som følge af kontakt formidlet gennem vibetrends.dk, sker udelukkende mellem dig og den pågældende konsulent/specialist.
          </p>
          <p>
            Vibetrends.dk og Kasper Landsvig (aiauto.dk) påtager sig intet ansvar for kvaliteten, leverancen, lovligheden eller eventuelle tab og skader opstået i forbindelse med ydelser leveret af konsulenter opført på denne platform.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-foreground">3. Indhold på platformen</h2>
          <p>
            Brugere er selv ansvarlige for det indhold, de indsender til Showcase, Forum eller andre steder på platformen. Det er strengt forbudt at indsende materiale, der krænker andres ophavsret, varemærker eller fortrolighedsaftaler.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-foreground">4. Ændring af vilkår</h2>
          <p>
            Vi forbeholder os retten til løbende at ændre eller opdatere disse brugervilkår uden forudgående varsel. Det er dit eget ansvar at holde dig opdateret med de gældende vilkår.
          </p>
        </section>
      </div>
    </div>
  );
}
