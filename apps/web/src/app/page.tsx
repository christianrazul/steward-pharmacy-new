"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { homePathFor } from "@/lib/session";
import { useSessionStore } from "@/stores/session-store";

/** Sends people to their role's home page, or to sign in. */
export default function IndexPage() {
  const router = useRouter();
  const user = useSessionStore((state) => state.user);

  useEffect(() => {
    router.replace(user ? homePathFor(user.role) : "/sign-in");
  }, [user, router]);

  return null;
}
