import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privatlivspolitik",
  description: "Privatlivspolitik for vibetrends.dk. Vi indsamler ingen sporingcookies og beskytter dine personoplysninger.",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-8 py-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
          Privatlivspolitik for <span className="text-accent-primary">vibetrends.dk</span>
        </h1>
        <p className="text-text-secondary text-sm">Sidst opdateret: 14. juni 2026</p>
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
            Vi vægter dit privatliv højt. Derfor benytter vibetrends.dk **ingen personhenførbare sporingscookies** eller tredjepartscookies. Vi indsamler udelukkende anonyme brugsstatistikker via Vercel Web Analytics, som ikke lagrer cookies på din enhed eller gemmer personlige oplysninger (IP-adresser anonymiseres fuldstændigt).
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
