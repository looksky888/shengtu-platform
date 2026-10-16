import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { EditingTurnDraft } from "@/app/image/lib/image-page-types";
import type { ModelOption, SetEditingTurnDraft } from "@/app/image/components/edit-dialog/types";

type ImageEditBasicFieldsProps = {
  draft: EditingTurnDraft;
  setDraft: SetEditingTurnDraft;
  modelOptions: ModelOption[];
};

export function ImageEditBasicFields({ draft, setDraft, modelOptions }: ImageEditBasicFieldsProps) {
  return (
    <>
      <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
        提示词
        <Textarea
          value={draft.prompt}
          onChange={(event) =>
            setDraft((current) => (current ? { ...current, prompt: event.target.value } : current))
          }
          className="min-h-[128px] resize-y rounded-2xl border-stone-200 bg-white text-sm leading-6 shadow-none"
        />
      </label>

      <div className={draft.mode === "chat" ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"}>
        {draft.mode !== "chat" ? (
          <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
            张数
            <Input
              type="number"
              inputMode="numeric"
              min="1"
              max="10"
              step="1"
              value={draft.count}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, count: event.target.value } : current))
              }
            />
          </label>
        ) : null}
        <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
          模型
          <Select
            value={draft.channelModelId || draft.model}
            onValueChange={(value) => {
              const option = modelOptions.find((item) => item.id === value);
              setDraft((current) => (current && option ? {
                ...current,
                model: option.value,
                channelModelId: option.channelModelId,
                channelName: option.channelName,
              } : current));
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {modelOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.channelName ? `${option.channelName} · ` : ""}{option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </label>
      </div>
    </>
  );
}
