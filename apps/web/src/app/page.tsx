"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useSession } from "@/data/hooks";
import { homePathFor } from "@/lib/session";

/** Sends people to their role's home page, or to sign in. */
export default function IndexPage() {
  const router = useRouter();
  const session = useSession();

  useEffect(() => {
    if (!session.isSuccess) return;
    router.replace(session.data ? homePathFor(session.data.user.role) : "/sign-in");
  }, [session.isSuccess, session.data, router]);

  return null;
}
