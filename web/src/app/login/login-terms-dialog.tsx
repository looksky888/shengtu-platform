import { TERMS_SECTIONS, TERMS_TITLE, TERMS_VERSION } from "@/app/login/login-terms";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type LoginTermsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function LoginTermsDialog({ open, onOpenChange }: LoginTermsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(85vh,40rem)] w-[min(100vw-1.5rem,32rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border/70 px-5 py-4 text-left">
          <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">
            {TERMS_TITLE}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            版本 {TERMS_VERSION} · 登录与注册前请完整阅读
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-4 text-sm leading-6 text-muted-foreground">
            <p className="rounded-lg border border-border/80 bg-surface-muted/85 px-3.5 py-2.5 text-[13px] leading-6 text-foreground">
              重要提示：本服务为技术工具。您须对使用行为及生成内容独立承担法律责任；因违法犯罪、侵权或其他违规使用造成的后果，与本项目开发者、维护者及部署方无关。
            </p>
            {TERMS_SECTIONS.map((section) => (
              <section key={section.heading} className="flex flex-col gap-1.5">
                <h3 className="font-semibold text-foreground">{section.heading}</h3>
                <p className="text-[13px] leading-6 text-muted-foreground">{section.body}</p>
              </section>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
