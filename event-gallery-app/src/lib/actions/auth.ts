"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, hashPassword, verifyPassword, clearSession } from "@/lib/auth";

export async function signupAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!email || password.length < 8) {
    redirect("/signup?error=Please+use+a+valid+email+and+an+8%2B+character+password");
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    redirect("/signup?error=An+account+with+that+email+already+exists");
  }

  const user = await db.user.create({
    data: { email, name, passwordHash: await hashPassword(password) },
  });

  await createSession(user.id);
  redirect("/dashboard");
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    redirect("/login?error=Invalid+email+or+password");
  }

  await createSession(user.id);
  redirect("/dashboard");
}

export async function logoutAction() {
  clearSession();
  redirect("/login");
}
