import { createContext, useContext, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { copy } from "@/web/copy";

type Asking = { message: string; answer: (yes: boolean) => void };

const ConfirmContext = createContext<(message: string) => Promise<boolean>>(async () => false);

/** Asks before an act that cannot be undone, in shadcn's Alert Dialog. */
export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [asking, setAsking] = useState<Asking | null>(null);
  const ask = (message: string) => new Promise<boolean>((answer) => setAsking({ message, answer }));
  const close = (yes: boolean) => {
    asking?.answer(yes);
    setAsking(null);
  };
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <AlertDialog open={asking !== null} onOpenChange={(open) => open || close(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.ask.title}</AlertDialogTitle>
            <AlertDialogDescription>{asking?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.ask.no}</AlertDialogCancel>
            <AlertDialogAction onClick={() => close(true)}>{copy.ask.yes}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}
