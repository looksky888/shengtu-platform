import { Link2 } from "lucide-react";

import { GrokProviderIcon } from "@/app/accounts/grok-provider-icons";
import {
  PROVIDER_LABELS,
  STATUS_LABELS,
  orderedConnections,
} from "@/app/accounts/grok-provider-account-model";
import type { GrokProviderRow } from "@/app/accounts/use-grok-provider-center";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function GrokProviderAccountCell({ account }: { account: GrokProviderRow }) {
  const connections = orderedConnections(account);
  const identity = account.display_name || account.email_masked || account.id;
  return (
    <div className="min-w-0">
      <div className="truncate font-medium" title={identity}>{identity}</div>
      {account.email_masked && account.email_masked !== identity ? (
        <div className="mt-0.5 truncate text-xs text-muted-foreground">{account.email_masked}</div>
      ) : null}
      <div className="mt-1.5 flex min-w-0 items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`查看 ${connections.length} 个关联身份`}
              className="inline-flex items-center gap-1.5 rounded-md outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              {connections.map((connection) => (
                <GrokProviderIcon key={`${connection.provider}:${connection.id}`} provider={connection.provider} className="size-3.5" />
              ))}
              {connections.length > 1 ? <Link2 className="ml-0.5 size-3 text-muted-foreground" /> : null}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-2.5">
            <div className="px-1 pb-2 text-xs font-medium text-muted-foreground">账号身份与关联</div>
            <div className="grid gap-1">
              {connections.map((connection) => (
                <div key={`${connection.provider}:${connection.id}`} className="rounded-lg px-2 py-2 hover:bg-muted/60">
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <GrokProviderIcon provider={connection.provider} className="size-3.5" />
                    <span>{PROVIDER_LABELS[connection.provider]}</span>
                    {connection.current ? <span className="text-primary">当前</span> : null}
                    <span className={cn("ml-auto", connection.status === "error" && "text-rose-600")}>{STATUS_LABELS[connection.status]}</span>
                  </div>
                  <div className="mt-1 truncate pl-5 font-mono text-[10px] text-muted-foreground" title={connection.id}>{connection.id}</div>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground" title={account.id}>{account.id}</span>
      </div>
    </div>
  );
}
