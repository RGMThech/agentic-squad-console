"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Recarrega os dados do servidor periodicamente enquanto há execução em andamento. */
export function AutoRefresh({ active, seconds = 12 }: { active: boolean; seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [active, seconds, router]);
  return null;
}
