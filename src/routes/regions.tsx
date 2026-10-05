import { useEffect, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Page, Refusal } from "@/components/page";
import { REGIONS_MAX } from "@/domain/regions/places";
import { cn } from "@/lib/utils";
import { copy } from "@/web/copy";
import { onlyFor } from "@/web/guards";
import { chooseRegions, getRegions, searchSuburbs } from "@/web/regions";

export const Route = createFileRoute("/regions")({
  beforeLoad: ({ context }) => {
    onlyFor("artisan", context);
  },
  loader: () => getRegions(),
  component: Regions,
});

const t = copy.regions;

/** The Artisan chooses one to three Regions, each opening to its suburbs. */
function Regions() {
  const { regions, chosen: saved } = Route.useLoaderData();
  const router = useRouter();
  const [chosen, setChosen] = useState<string[]>(saved);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const full = chosen.length >= REGIONS_MAX;
  const unchanged = chosen.length === saved.length && chosen.every((id) => saved.includes(id));

  function toggle(regionId: string, checked: boolean) {
    setDone(false);
    setChosen((now) => (checked ? [...now, regionId] : now.filter((id) => id !== regionId)));
  }

  async function save() {
    setBusy(true);
    setRefusal(null);
    const result = await chooseRegions({ data: { regionIds: chosen } });
    setBusy(false);
    if (!result.ok) return setRefusal(result.refusal.message);
    setDone(true);
    await router.invalidate();
  }

  return (
    <Page title={t.title} narrow>
      <p className="text-sm text-muted-foreground">{t.lead}</p>
      <Card>
        <CardContent>
          <ul className="divide-y">
            {regions.map((region) => {
              const checked = chosen.includes(region.id);
              const expanded = open === region.id;
              return (
                <li key={region.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <Label className="flex-1 gap-3 py-1">
                      <Checkbox
                        aria-label={region.name}
                        checked={checked}
                        disabled={!checked && full}
                        onCheckedChange={(value) => toggle(region.id, value)}
                      />
                      <span className="font-medium">{region.name}</span>
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-expanded={expanded}
                      aria-controls={`suburbs-${region.id}`}
                      aria-label={expanded ? t.close(region.name) : t.open(region.name)}
                      onClick={() => setOpen(expanded ? null : region.id)}
                    >
                      <span className="text-muted-foreground">
                        {t.suburbs(region.suburbs.length)}
                      </span>
                      <ChevronDown
                        className={cn("transition-transform", expanded && "rotate-180")}
                      />
                    </Button>
                  </div>
                  {expanded && (
                    <ul
                      id={`suburbs-${region.id}`}
                      className="mt-3 columns-2 gap-4 text-xs text-muted-foreground sm:columns-3"
                    >
                      {region.suburbs.map((suburb) => (
                        <li key={suburb.id} className="break-inside-avoid py-0.5">
                          {suburb.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={busy || chosen.length === 0 || unchanged} onClick={() => void save()}>
          {t.save}
        </Button>
        <span className="text-sm text-muted-foreground">
          {t.chosen(chosen.length, REGIONS_MAX)}
        </span>
        {done && <span className="text-sm text-muted-foreground">{t.saved}</span>}
      </div>
      <Refusal message={refusal} />
      <FindSuburb />
    </Page>
  );
}

type Found = Awaited<ReturnType<typeof searchSuburbs>>;

/** Which Region a suburb is in, searched however it is typed. */
function FindSuburb() {
  const [query, setQuery] = useState("");
  // What was found, and for which query, so an older answer never shows under a newer query.
  const [found, setFound] = useState<{ query: string; suburbs: Found } | null>(null);
  const searching = query.trim() !== "";

  useEffect(() => {
    if (!searching) return;
    let current = true;
    const wait = setTimeout(() => {
      void searchSuburbs({ data: { query } }).then((result) => {
        if (current) setFound({ query, suburbs: result });
      });
    }, 200);
    return () => {
      current = false;
      clearTimeout(wait);
    };
  }, [query, searching]);

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t.find}</CardTitle>
        <CardDescription>{t.findLead}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="suburb">{t.findLabel}</Label>
          <Input
            id="suburb"
            type="search"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {searching &&
          found?.query === query &&
          (found.suburbs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.noMatch}</p>
          ) : (
            <ul className="divide-y text-sm" aria-live="polite">
              {found.suburbs.map((suburb) => (
                <li key={suburb.id} className="flex justify-between gap-3 py-1.5">
                  <span>{suburb.name}</span>
                  <span className="text-muted-foreground">{suburb.region.name}</span>
                </li>
              ))}
            </ul>
          ))}
      </CardContent>
    </Card>
  );
}
