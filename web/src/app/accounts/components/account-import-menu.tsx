import { FileJson, Files, KeyRound } from "lucide-react";

import { AccountImportMethodCard } from "@/app/accounts/components/account-import-method-card";

type AccountImportMenuProps = {
  onToken: () => void;
  onSession: () => void;
  onCpa: () => void;
  onRemoteCpa: () => void;
};

export function AccountImportMenu({ onToken, onSession, onCpa, onRemoteCpa }: AccountImportMenuProps) {
  return (
    <div className="space-y-3">
      <AccountImportMethodCard
        title="导入 Access Token"
        description="支持直接粘贴，一行一个；也支持从 TXT 文件读取，一行一个。"
        icon={KeyRound}
        onClick={onToken}
      />
      <AccountImportMethodCard
        title="导入 Session JSON"
        description="从 chatgpt.com 的 session 接口复制完整 JSON，自动提取 accessToken。"
        icon={FileJson}
        onClick={onSession}
      />
      <AccountImportMethodCard
        title="导入 CPA JSON 文件"
        description="支持一次多选多个本地 JSON 文件，逐个读取对象里的 access_token 后导入。"
        icon={Files}
        onClick={onCpa}
      />
      <AccountImportMethodCard
        title="从远程 CPA 服务器导入"
        description="前往设置页面配置远程 CPA 服务器后再执行导入。"
        icon={Files}
        onClick={onRemoteCpa}
      />
    </div>
  );
}