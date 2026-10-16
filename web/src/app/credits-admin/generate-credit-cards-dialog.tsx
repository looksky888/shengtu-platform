import { LoaderCircle, Plus } from "lucide-react";

import type { CreditsAdminState } from "@/app/credits-admin/use-credits-admin";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function GenerateCreditCardsDialog({ state }: { state: CreditsAdminState }) {
  return (
    <Dialog open={state.isGenerateDialogOpen} onOpenChange={state.setIsGenerateDialogOpen}>
      <DialogContent className="rounded-2xl p-6">
        <DialogHeader className="gap-2">
          <DialogTitle>生成积分卡密</DialogTitle>
          <DialogDescription className="text-sm leading-6">输入单张卡密的积分面值和生成数量。生成成功后，明文兑换码只会展示一次，请立即复制保存。</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="credits-admin-generate-amount">积分面值</FieldLabel>
            <Input id="credits-admin-generate-amount" type="number" inputMode="numeric" min="1" max="1000000" step="1" value={state.generateAmount} onChange={(event) => state.setGenerateAmount(event.target.value)} className="h-10 rounded-lg" />
          </Field>
          <Field>
            <FieldLabel htmlFor="credits-admin-generate-count">生成数量（最多 100）</FieldLabel>
            <Input id="credits-admin-generate-count" type="number" inputMode="numeric" min="1" max="100" step="1" value={state.generateCount} onChange={(event) => state.setGenerateCount(event.target.value)} className="h-10 rounded-lg" />
            <FieldDescription>建议按批次保存结果，避免重复生成后难以核对。单次最多 100 张。</FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="secondary" className="h-10 rounded-xl px-5" onClick={() => state.setIsGenerateDialogOpen(false)} disabled={state.isGenerating}>取消</Button>
          <Button type="button" className="h-10 rounded-xl px-5" onClick={() => void state.handleGenerateCards()} disabled={state.isGenerating}>
            {state.isGenerating ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}立即生成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}