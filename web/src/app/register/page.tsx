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
    <div className="flex flex-col gap-5 pb-8">
      <RegisterDataController />
      <PageHeader
        eyebrow="号池与运维"
        title="账号注册"
        description="配置多源邮箱池、代理与并发流水线，自动化执行 ChatGPT 或 Grok 账号注册并同步写入运行号池。"
      />
      <RegisterCard />
    </div>
  );
}

export default function RegisterPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/register");

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <RegisterPageContent />;
}
