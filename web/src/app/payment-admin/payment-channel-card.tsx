import { CreditCard, KeyRound, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PaymentChannel } from "@/lib/payment-admin-api";

export function PaymentChannelCard({
  item,
  onEdit,
  onRotate,
}: {
  item: PaymentChannel;
  onEdit: () => void;
  onRotate: () => void;
}) {
  const providerName = item.provider === "alipay" ? "支付宝" : "微信支付";
  return (
    <article className="rounded-2xl border border-border/80 bg-background p-4 shadow-[0_4px_14px_rgba(15,23,42,0.04)] transition hover:border-[#bfdbfe] hover:shadow-[0_10px_26px_rgba(20,86,240,0.10)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`grid size-10 shrink-0 place-items-center rounded-xl ${item.provider === "alipay" ? "bg-sky-50 text-sky-700 dark:bg-sky-950/35 dark:text-sky-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-300"}`}>
            <CreditCard className="size-5" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-semibold">{item.name}</h3>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.code} · {providerName}</p>
          </div>
        </div>
        <Badge variant={item.enabled ? "success" : "secondary"}>{item.enabled ? "已启用" : "已停用"}</Badge>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-muted/45 px-3 py-2">
          <div className="text-xs text-muted-foreground">默认渠道</div>
          <div className="mt-1 font-medium">{item.is_default ? "是" : "否"}</div>
        </div>
        <div className="rounded-xl bg-muted/45 px-3 py-2">
          <div className="text-xs text-muted-foreground">订单有效期</div>
          <div className="mt-1 font-medium">{item.order_expire_minutes} 分钟</div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onRotate}><KeyRound className="size-3.5" />轮换凭据</Button>
        <Button type="button" size="sm" onClick={onEdit}><Pencil className="size-3.5" />编辑配置</Button>
      </div>
    </article>
  );
}
