import { copy } from "@/web/copy";

const t = copy.landing;

/** How a Job goes, in four steps: on the landing page, and for a Client with no Job yet. */
export function HowAJobGoes() {
  return (
    <section aria-labelledby="how" className="space-y-4">
      <h2 id="how" className="text-lg font-semibold">
        {t.howTitle}
      </h2>
      <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {t.how.map((step, index) => (
          <li key={step.title} className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium text-primary">{t.step(index + 1)}</p>
            <h3 className="font-semibold">{step.title}</h3>
            <p className="text-sm text-muted-foreground">{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
