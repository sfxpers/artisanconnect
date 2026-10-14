import { Link } from "@tanstack/react-router";
import { Wordmark } from "@/components/wordmark";
import { copy } from "@/web/copy";

/** Under every page: what ArtisanConnect is, and where the rules and help are. */
export function AppFooter({ signedIn }: { signedIn: boolean }) {
  const t = copy.footer;
  const link = "rounded-sm text-muted-foreground hover:text-foreground";
  return (
    <footer className="mt-16 border-t bg-card">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="max-w-xs space-y-2">
          <Wordmark />
          <p className="text-sm text-muted-foreground">{t.tagline}</p>
        </div>
        <nav aria-label={t.nav} className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link to="/artisans" className={link}>
            {t.findArtisans}
          </Link>
          <Link to="/rules" className={link}>
            {t.rules}
          </Link>
          {signedIn && (
            <Link to="/support" className={link}>
              {t.support}
            </Link>
          )}
        </nav>
      </div>
    </footer>
  );
}
