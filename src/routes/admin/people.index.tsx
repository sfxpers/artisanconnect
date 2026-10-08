import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Page } from "@/components/page";
import { copy } from "@/web/copy";
import { onlyForAdmins } from "@/web/guards";
import { findPeople } from "@/web/people";

export const Route = createFileRoute("/admin/people/")({
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search.q === "string" && search.q ? { q: search.q } : {},
  beforeLoad: ({ context }) => {
    onlyForAdmins(context);
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => findPeople({ data: { query: deps.q ?? "" } }),
  component: People,
});

const t = copy.admin.people;

/** The People page (#136): find an Account by name or Email, then act on it on its own page. */
function People() {
  const people = Route.useLoaderData();
  const { q } = Route.useSearch();
  const navigate = useNavigate();
  const [query, setQuery] = useState(q ?? "");
  return (
    <Page title={t.title}>
      <p className="max-w-2xl text-sm text-muted-foreground">{t.lead}</p>
      <form
        className="flex max-w-md gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void navigate({ to: "/admin/people", search: query.trim() ? { q: query.trim() } : {} });
        }}
      >
        <Input
          aria-label={t.search}
          placeholder={t.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button type="submit">{t.find}</Button>
      </form>
      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <Card className="py-0">
          <ul className="divide-y">
            {people.map((person) => (
              <li key={person.accountId}>
                <Link
                  to="/admin/people/$accountId"
                  params={{ accountId: person.accountId }}
                  className="flex items-center gap-3 p-4 hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{person.name}</span>
                      <Badge variant="secondary">{copy.signUp.kind.chosen[person.kind]}</Badge>
                      {person.suspended && <Badge variant="destructive">{t.suspended}</Badge>}
                      {person.closed && <Badge variant="outline">{t.closed[person.closed]}</Badge>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{person.email}</div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Page>
  );
}
