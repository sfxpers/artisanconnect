import { useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * A button whose click is an action on the server: it turns until the action
 * is done, so the one pressed shows it is on its way, and cannot be pressed twice.
 */
export function ActionButton({
  onClick,
  disabled,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick"> & { onClick: () => unknown }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      {...props}
      disabled={pending || disabled}
      onClick={async () => {
        setPending(true);
        try {
          await onClick();
        } finally {
          setPending(false);
        }
      }}
    >
      {pending && <Spinner data-icon="inline-start" />}
      {children}
    </Button>
  );
}
