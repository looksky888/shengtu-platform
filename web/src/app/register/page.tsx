"use client";

import { useEffect, useRef } from "react";
import { LoaderCircle } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { useAuthGuard } from "@/lib/use-auth-guard";

import { useSettingsStore } from "../settings/store";
import { RegisterCard } from "./components/register-card";
import { useRegisterSSE } from "./use-register-sse";

function RegisterDataController() {
  const didLoadRef = useRef(false);
  const loadRegister = useSettingsStore((state) => state.loadRegister);
  const setRegisterConfig = useSettingsStore((state) => state.setRegisterConfig);

  useEffect(() => {
    if (didLoadRef.current) return;
    didLoadRef.current = true;
    void loadRegister();
  }, [loadRegister]);

  useRegisterSSE(setRegisterConfig);

  return null;
}

function RegisterPageContent() {
  return (
    <>
      <RegisterDataController />
      <PageHeader eyebrow="注册机" title="账号注册" />
      <section className="mt-4">
        <RegisterCard />
      </section>
    </>
  );
}

export default function RegisterPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/register");

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-stone-400" />
      </div>
    );
  }

  return <RegisterPageContent />;
}
