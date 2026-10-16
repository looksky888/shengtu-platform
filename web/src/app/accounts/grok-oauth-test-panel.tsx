import { FlaskConical, LoaderCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { GrokOAuthController } from "./use-grok-oauth-panel";

export function GrokOAuthTestPanel({ controller }: { controller: GrokOAuthController }) {
  const { accounts, busy, test } = controller;
  if (!test.showTest) return null;
  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="text-xs">
          <span className="mb-1 block text-muted-foreground">测试范围</span>
          <div className="flex gap-2">
            {(["all", "single"] as const).map((scope) => (
              <button
                key={scope}
                type="button"
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs",
                  test.testScope === scope ? "border-sky-300 bg-sky-50 text-sky-800" : "border-border bg-background",
                )}
                onClick={() => test.setTestScope(scope)}
              >
                {scope === "all" ? "全部账号" : "指定账号"}
              </button>
            ))}
          </div>
        </div>
        {test.testScope === "single" ? (
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">指定账号</span>
            <select className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs" value={test.testAccountId} onChange={(event) => test.setTestAccountId(event.target.value)}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.email || account.subject_preview || account.id} · {account.status}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <div className="grid gap-3 md:grid-cols-[12rem_1fr]">
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">模型</span>
          <select className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs" value={test.testModel} onChange={(event) => test.setTestModel(event.target.value)}>
            {test.modelOptions.map((model) => <option key={model} value={model}>{model}</option>)}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">测试提示词</span>
          <Input className="h-9 text-xs" value={test.testPrompt} onChange={(event) => test.setTestPrompt(event.target.value)} />
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => test.setShowTest(false)}>收起</Button>
        <Button size="sm" className="h-8 rounded-lg" disabled={busy || test.testRunning} onClick={() => void test.handleRunTest()}>
          {test.testRunning ? <LoaderCircle className="size-3.5 animate-spin" /> : <FlaskConical className="size-3.5" />}
          {test.testScope === "all" ? "测试全部" : "测试指定"}
        </Button>
      </div>
      {test.testResults.length ? (
        <div className="max-h-48 divide-y divide-border overflow-auto border-t border-border pt-2">
          {test.testResults.map((result) => (
            <div key={result.accountId} className="space-y-1 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-medium">{result.label}</p>
                <Badge variant={result.status === "success" ? "success" : result.status === "failed" ? "danger" : "secondary"}>
                  {result.status === "success" ? "可用" : result.status === "failed" ? "失败" : "等待"}
                </Badge>
              </div>
              {result.error ? <p className="break-words text-xs text-rose-600">{result.error}</p> : null}
              {result.content ? <p className="break-words text-xs text-foreground">{result.content}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
