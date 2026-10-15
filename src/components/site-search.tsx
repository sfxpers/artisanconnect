import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from "@/components/ui/combobox";
import { InputGroupAddon } from "@/components/ui/input-group";
import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_NAMES,
  type ServiceCategory,
} from "@/domain/service-categories";
import { copy } from "@/web/copy";

type Found = { label: string; category: ServiceCategory };

const t = copy.search;

const GROUPS = [
  {
    label: t.trades,
    items: SERVICE_CATEGORIES.map((category) => ({
      label: SERVICE_CATEGORY_NAMES[category],
      category,
    })),
  },
  { label: t.jobs, items: copy.popularJobs as Found[] },
];

/**
 * The header's search: a trade, or a job people often need, which opens
 * Browse on the trade that does it. There is no free-text search of Artisans.
 */
export function SiteSearch({ className }: { className?: string }) {
  const navigate = useNavigate();
  return (
    <Combobox
      items={GROUPS}
      // Enter takes the first match, as a shop's search does.
      autoHighlight
      itemToStringLabel={(item: Found) => item.label}
      onValueChange={(item: Found | null) => {
        if (item) void navigate({ to: "/artisans", search: { category: item.category } });
      }}
    >
      <ComboboxInput
        aria-label={t.label}
        placeholder={t.placeholder}
        showTrigger={false}
        className={className}
      >
        <InputGroupAddon>
          <Search aria-hidden />
        </InputGroupAddon>
      </ComboboxInput>
      <ComboboxContent>
        <ComboboxEmpty>{t.none}</ComboboxEmpty>
        <ComboboxList>
          {(group: (typeof GROUPS)[number]) => (
            <ComboboxGroup key={group.label} items={group.items}>
              <ComboboxLabel>{group.label}</ComboboxLabel>
              <ComboboxCollection>
                {(item: Found) => (
                  <ComboboxItem key={item.label} value={item} className="justify-between">
                    <span>{item.label}</span>
                    {item.label !== SERVICE_CATEGORY_NAMES[item.category] && (
                      <span className="text-muted-foreground">
                        {t.in(SERVICE_CATEGORY_NAMES[item.category])}
                      </span>
                    )}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
