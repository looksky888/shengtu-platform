import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  ICLOUD_CODE_PLATFORM_OPTIONS,
  resolveICloudCodeKeyword,
  type ICloudCodePlatform,
} from "./icloud-code-platform";

export function ICloudCodeFilter({ onKeywordChange }: { onKeywordChange: (keyword: string) => void }) {
  const [platform, setPlatform] = useState<ICloudCodePlatform>("auto");
  const [customKeyword, setCustomKeyword] = useState("");

  function updatePlatform(value: string) {
    const next = value as ICloudCodePlatform;
    setPlatform(next);
    onKeywordChange(resolveICloudCodeKeyword(next, customKeyword));
  }

  function updateCustomKeyword(value: string) {
    setCustomKeyword(value);
    onKeywordChange(resolveICloudCodeKeyword("custom", value));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">取码平台</span>
      <Select value={platform} onValueChange={updatePlatform}>
        <SelectTrigger className="h-9 w-[158px] rounded-lg" aria-label="选择取码平台">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ICLOUD_CODE_PLATFORM_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {platform === "custom" ? (
        <Input
          aria-label="自定义取码平台或发件人关键词"
          className="h-9 w-40 rounded-lg"
          placeholder="输入平台或发件人关键词"
          value={customKeyword}
          onChange={(event) => updateCustomKeyword(event.target.value)}
        />
      ) : null}
    </div>
  );
}
