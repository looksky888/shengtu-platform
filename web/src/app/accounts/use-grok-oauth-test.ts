import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { testGrokOAuthAccount, type GrokOAuthAccount } from "@/lib/grok-accounts-api";

export type GrokOAuthTestResult = {
  accountId: string;
  label: string;
  status: "pending" | "success" | "failed";
  elapsedMs: number | null;
  content: string;
  error: string;
};

export function useGrokOAuthTest(
  accounts: GrokOAuthAccount[],
  availableModels: string[],
  onBusyChange: (busy: boolean) => void,
  onFinished: () => Promise<void>,
) {
  const [showTest, setShowTest] = useState(false);
  const [testModel, setTestModel] = useState("");
  const [testPrompt, setTestPrompt] = useState("你好，请只回复 OK。");
  const [testScope, setTestScope] = useState<"all" | "single">("all");
  const [testAccountId, setTestAccountId] = useState("");
  const [testRunning, setTestRunning] = useState(false);
  const [testResults, setTestResults] = useState<GrokOAuthTestResult[]>([]);
  const modelOptions = useMemo(
    () => Array.from(new Set([...availableModels, ...accounts.flatMap((account) => account.models || [])])),
    [availableModels, accounts],
  );

  useEffect(() => {
    if (!testAccountId && accounts[0]?.id) setTestAccountId(accounts[0].id);
    if (!testModel && modelOptions[0]) setTestModel(modelOptions[0]);
  }, [accounts, modelOptions, testAccountId, testModel]);

  async function handleRunTest() {
    const model = testModel.trim();
    const prompt = testPrompt.trim();
    const targets = testScope === "all" ? [...accounts] : accounts.filter((account) => account.id === testAccountId);
    if (!model || !prompt || !targets.length) {
      toast.error("请选择模型与测试账号");
      return;
    }
    setTestRunning(true);
    onBusyChange(true);
    const results: GrokOAuthTestResult[] = targets.map((account) => ({
      accountId: account.id,
      label: account.email || account.subject_preview || account.subject || account.id,
      status: "pending",
      elapsedMs: null,
      content: "",
      error: "",
    }));
    setTestResults(results);
    let ok = 0;
    let fail = 0;
    for (let index = 0; index < targets.length; index += 1) {
      const started = performance.now();
      try {
        const response = await testGrokOAuthAccount(targets[index].id, { model, prompt });
        results[index] = {
          ...results[index],
          status: "success",
          elapsedMs: response.elapsed_ms ?? Math.round(performance.now() - started),
          content: String(response.content || ""),
        };
        ok += 1;
      } catch (testError) {
        results[index] = {
          ...results[index],
          status: "failed",
          elapsedMs: Math.round(performance.now() - started),
          error: testError instanceof Error ? testError.message : "测试失败",
        };
        fail += 1;
      }
      setTestResults([...results]);
    }
    if (fail) toast.warning(`测试完成：成功 ${ok}，失败 ${fail}`);
    else toast.success(`测试完成：${ok} 个账号可用`);
    await onFinished();
    setTestRunning(false);
    onBusyChange(false);
  }

  return {
    showTest, setShowTest, testModel, setTestModel, testPrompt, setTestPrompt, testScope,
    setTestScope, testAccountId, setTestAccountId, testRunning, testResults, modelOptions,
    handleRunTest,
  };
}

export type GrokOAuthTestController = ReturnType<typeof useGrokOAuthTest>;
