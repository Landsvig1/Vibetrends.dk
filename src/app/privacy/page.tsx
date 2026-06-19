import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Language } from "@/lib/translations";

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";
  return {
    title: lang === "da" ? "Privatlivspolitik" : "Privacy Policy",
    description: lang === "da" 
      ? "Privatlivspolitik for vibetrends.dk. Vi indsamler ingen sporingcookies og beskytter dine personoplysninger."
      : "Privacy policy for vibetrends.dk. We collect no tracking cookies and protect your personal data.",
  };
}

export default async function PrivacyPage() {
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";

  if (lang === "en") {
    return (
      <div className="max-w-3xl mx-auto space-y-8 py-8">
        <div className="space-y-4">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
            Privacy Policy for <span className="text-accent-primary">vibetrends.dk</span>
          </h1>
          <p className="text-text-secondary text-sm">Last updated: June 16, 2026</p>
        </div>

        <div className="prose prose-invert text-text-secondary space-y-6 text-sm leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground">1. Data Controller</h2>
            <p>
              Vibetrends.dk is owned and operated by Kasper Landsvig, Brøndby, Denmark. Contact us at{" "}
              <a href="mailto:kasper@aiauto.dk" className="text-accent-primary hover:underline">
                kasper@aiauto.dk
              </a>{" "}
              for questions regarding data collection or privacy.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground">2. No Tracking Cookies</h2>
            <p>
              We value your privacy. Therefore, vibetrends.dk uses <strong>no personally identifiable tracking cookies</strong> or third-party cookies. We only collect anonymous usage statistics via Vercel Web Analytics, which does not store cookies on your device or save personal information (IP addresses are completely anonymized).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground">3. Collection of Information upon Booking</h2>
            <p>
              When you submit an inquiry or book a Vibe Coder via our forms, we only collect the information you provide yourself:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Email address</li>
              <li>Project description and accompanying details</li>
            </ul>
            <p>
              This data is used solely to facilitate contact between you and the respective consultant/specialist and is deleted once the inquiry is resolved.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground">4. Your Rights</h2>
            <p>
              Under the GDPR, you have the right to request access to, correction, or deletion of the personal data we hold about you. You can contact us at any time to have your inquiry data deleted.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground">5. Right to Complain</h2>
            <p>
              If you wish to complain about our processing of your personal data, you can submit a complaint to the Danish Data Protection Agency (datatilsynet.dk).
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
          Privatlivspolitik for <span className="text-accent-primary">vibetrends.dk</span>
        </h1>
        <p className="text-text-secondary text-sm">Sidst opdateret: 16. juni 2026</p>
      </div>

      <div className="prose prose-invert text-text-secondary space-y-6 text-sm leading-relaxed">
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-foreground">1. Dataansvarlig</h2>
          <p>
            Vibetrends.dk er ejet og drevet af Kasper Landsvig, Brøndby, Danmark. Kontakt os på{" "}
            <a href="mailto:kasper@aiauto.dk" className="text-accent-primary hover:underline">
              kasper@aiauto.dk
            </a>{" "}
            ved spørgsmål angående dataopsamling eller privatliv.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-foreground">2. Ingen sporingscookies</h2>
          <p>
            Vi vægter dit privatliv højt. Derfor benytter vibetrends.dk <strong>ingen personhenførbare sporingscookies</strong> eller tredjepartscookies. Vi indsamler udelukkende anonyme brugsstatistikker via Vercel Web Analytics, som ikke lagrer cookies på din enhed eller gemmer personlige oplysninger (IP-adresser anonymiseres fuldstændigt).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-foreground">3. Indsamling af oplysninger ved booking</h2>
          <p>
            Når du foretager en henvendelse eller booker en Vibe Coder via vores formularer, indsamler vi udelukkende de oplysninger, du selv angiver:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>E-mailadresse</li>
            <li>Projektbeskrivelse og medfølgende detaljer</li>
          </ul>
          <p>
            Disse data anvendes udelukkende til at formidle kontakten mellem dig og den pågældende konsulent/specialist og slettes efterfølgende, når henvendelsen er afsluttet.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-foreground">4. Dine rettigheder</h2>
          <p>
            I henhold til GDPR har du ret til at anmode om indsigt i, berigtigelse af eller sletning af de personoplysninger, vi har registreret om dig. Du kan til enhver tid rette henvendelse for at få slettet dine henvendelsesdata.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-foreground">5. Klageadgang</h2>
          <p>
            Hvis du ønsker at klage over vores behandling af dine personoplysninger, kan du indgive en klage til Datatilsynet (datatilsynet.dk).
          </p>
        </section>
      </div>
    </div>
  );
}
