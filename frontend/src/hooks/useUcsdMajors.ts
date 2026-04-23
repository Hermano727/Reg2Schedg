"use client";

import { useEffect, useState } from "react";
import { FALLBACK_UCSD_MAJORS, fetchUcsdMajors } from "@/lib/profile/ucsdMajors";

export function useUcsdMajors() {
  const [majors, setMajors] = useState<string[]>(FALLBACK_UCSD_MAJORS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadMajors() {
      try {
        const nextMajors = await fetchUcsdMajors();
        if (!cancelled && nextMajors.length > 0) {
          setMajors(nextMajors);
        }
      } catch (error) {
        console.warn("Failed to load UCSD majors from Supabase; using fallback list.", error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadMajors();

    return () => {
      cancelled = true;
    };
  }, []);

  return { majors, loading };
}
