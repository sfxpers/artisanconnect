import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** shadcn's Select over a list of options; "" stands for none chosen. */
export function Choose<Value extends string>({
  id,
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  id: string;
  value: Value | "";
  onChange: (value: Value | "") => void;
  options: { value: Value | ""; label: string }[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <Select<Value | "">
      items={options}
      value={value === "" && !options.some((each) => each.value === "") ? null : value}
      onValueChange={(chosen) => onChange(chosen ?? "")}
    >
      <SelectTrigger id={id} className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
