import { authMode } from "@/lib/auth/mode";
import { currentConsultant } from "@/server/auth";
import { SignOutButton } from "./sign-out-button";

/** Who is signed in, and a way out. Shows nothing in local mode, where there is no login. */
export async function AccountMenu() {
  if (authMode() === "local") return null;
  const c = await currentConsultant();
  if (!c) return null;
  return (
    <div className="ml-auto flex items-center gap-3 text-sm" data-testid="account-menu">
      <span className="text-muted-foreground" data-testid="account-email">
        {c.email}
      </span>
      <SignOutButton />
    </div>
  );
}
