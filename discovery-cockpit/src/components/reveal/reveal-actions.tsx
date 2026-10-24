"use client";

import { Printer } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Toolbar shown above a client document on screen; hidden when printing. `printHref` is the document's ?print=1 view. */
export function RevealActions({ printHref }: { printHref: string }) {
  return (
    <div className="mx-auto mb-4 flex max-w-3xl justify-end gap-2 print:hidden">
      <Button asChild>
        <a href={printHref} target="_blank" rel="noreferrer">
          <Printer /> Download PDF
        </a>
      </Button>
    </div>
  );
}

/** Opens the browser's Print dialog once (Save as PDF), for the ?print=1 view. */
export function AutoPrint() {
  useEffect(() => {
    const id = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <p className="mx-auto mb-4 max-w-3xl rounded-md bg-slate-100 p-3 text-sm text-slate-600 print:hidden">
      Choose <strong>Save as PDF</strong> as the destination in the print dialog. If it didn&apos;t open,{" "}
      <button className="underline" onClick={() => window.print()}>
        click here
      </button>
      .
    </p>
  );
}
