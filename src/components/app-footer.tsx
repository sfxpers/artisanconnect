import { Link } from "@tanstack/react-router";
import { Wordmark } from "@/components/wordmark";
import { SERVICE_CATEGORIES, SERVICE_CATEGORY_NAMES } from "@/domain/shared/service-categories";
import { copy } from "@/web/copy";

/**
 * Under every page: Browse by each trade and each Region, which search
 * engines follow as Kandua's footer is followed; then the rules and help.
 */
export function AppFooter({
  signedIn,
  regions,
}: {
  signedIn: boolean;
  regions: { id: string; name: string }[];
}) {
  const t = copy.footer;
  const link = "rounded-sm text-muted-foreground hover:text-foreground";
  return (
    <footer className="mt-16 border-t bg-card">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-4 py-10 sm:px-6 lg:grid-cols-4">
        <div className="col-span-2 space-y-2 lg:col-span-1">
          <Wordmark />
          <p className="text-sm text-muted-foreground">{t.tagline}</p>
        </div>
        <nav aria-labelledby="footer-trades" className="space-y-3 text-sm">
          <h2 id="footer-trades" className="font-semibold">
            {t.trades}
          </h2>
          <ul className="space-y-2">
            {SERVICE_CATEGORIES.map((category) => (
              <li key={category}>
                <Link to="/artisans" search={{ category }} className={link}>
                  {copy.browse.titleFor(SERVICE_CATEGORY_NAMES[category])}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-labelledby="footer-regions" className="space-y-3 text-sm">
          <h2 id="footer-regions" className="font-semibold">
            {t.regions}
          </h2>
          <ul className="space-y-2">
            {regions.map((region) => (
              <li key={region.id}>
                <Link to="/artisans" search={{ region: region.id }} className={link}>
                  {region.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-labelledby="footer-company" className="space-y-3 text-sm">
          <h2 id="footer-company" className="font-semibold">
            {t.company}
          </h2>
          <ul className="space-y-2">
            <li>
              <Link to="/artisans" className={link}>
                {t.findArtisans}
              </Link>
            </li>
            <li>
              <Link to="/rules" className={link}>
                {t.rules}
              </Link>
            </li>
            <li>
              {signedIn ? (
                <Link to="/support" className={link}>
                  {t.support}
                </Link>
              ) : (
                <Link to="/sign-up" className={link}>
                  {t.signUp}
                </Link>
              )}
            </li>
          </ul>
        </nav>
      </div>
      <p className="mx-auto max-w-7xl px-4 pb-8 text-xs text-muted-foreground sm:px-6">
        <a href="/trades/CREDITS.md" className={link}>
          {t.photos}
        </a>
      </p>
    </footer>
  );
}
