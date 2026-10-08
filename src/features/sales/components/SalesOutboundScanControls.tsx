import {Camera, ScanLine} from "lucide-react";
import type {Ref} from "react";
import {ErpField} from "@/src/components/common";
import {Button, Input, Textarea} from "@/src/components/ui";

export function SalesOutboundScanControls({inputRef, input, codes, pending, onInputChange, onCodesChange, onAppend, onOpenCamera}: {
  inputRef: Ref<HTMLInputElement>;
  input: string;
  codes: string;
  pending: boolean;
  onInputChange: (value: string) => void;
  onCodesChange: (value: string) => void;
  onAppend: () => void;
  onOpenCamera: () => void;
}) {
  return <div data-erp-component="outbound-scan-controls" className="space-y-3">
    <div className="flex min-w-0 flex-wrap gap-2 sm:flex-nowrap">
      <ErpField label="扫码枪 / 手动输入" className="min-w-0 flex-1 basis-full sm:basis-auto">
        <Input ref={inputRef} value={input} onChange={(event) => onInputChange(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {event.preventDefault(); if (!pending && input.trim()) onAppend();}
        }} className="min-w-0" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done" placeholder="输入或扫描库存 ID / SN" aria-label="销售出库扫码枪输入" disabled={pending} />
      </ErpField>
      <div className="flex w-full gap-2 sm:w-auto sm:self-end">
        <Button type="button" variant="secondary" className="flex-1 sm:flex-none" onClick={onAppend} disabled={pending || !input.trim()} aria-label="追加扫码内容" title="追加扫码内容"><ScanLine className="h-4 w-4" />追加</Button>
        <Button type="button" variant="secondary" className="flex-1 sm:flex-none" onClick={onOpenCamera} disabled={pending} aria-label="打开摄像头扫码" title="打开摄像头扫码"><Camera className="h-4 w-4" />摄像头</Button>
      </div>
    </div>
    <ErpField label="已扫描库存 ID / SN">
      <Textarea className="min-h-24 erp-data-number" value={codes} onChange={(event) => onCodesChange(event.target.value)} placeholder="可粘贴多件 SN，按换行、空格或逗号分隔" autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={pending} aria-label="已扫描库存 ID / SN" />
    </ErpField>
  </div>;
}
