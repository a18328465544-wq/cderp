import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {Controller, useForm} from "react-hook-form";
import {Input} from "@/src/components/ui";
import {ErpField} from "./ErpField";

test("ErpField associates generated ids, hints and errors with its control", () => {
  const markup = renderToStaticMarkup(<ErpField label="商品名称" required hint="用于生成标准名称" error="商品名称不能为空"><Input /></ErpField>);
  const id = markup.match(/<input[^>]* id="([^"]+)"/)?.[1];
  assert.ok(id);
  assert.match(markup, new RegExp(`for="${id}"`));
  assert.match(markup, new RegExp(`aria-describedby="${id}-hint ${id}-error"`));
  assert.match(markup, /aria-invalid="true"/);
  assert.match(markup, new RegExp(`id="${id}-hint"`));
  assert.match(markup, new RegExp(`id="${id}-error"`));
  assert.match(markup, /商品名称.*\*/);
});

function ControllerField() {
  const {control} = useForm<{name: string}>({defaultValues: {name: ""}});
  return <ErpField label="客户名称" hint="用于建立关联" error="客户名称不能为空">
    <Controller control={control} name="name" render={({field}) => <Input {...field} />} />
  </ErpField>;
}

test("ErpField passes generated accessibility props through Controller", () => {
  const markup = renderToStaticMarkup(<ControllerField />);
  const input = markup.match(/<input[^>]*>/)?.[0] || "";
  const id = input.match(/id="([^"]+)"/)?.[1];
  assert.ok(id);
  assert.match(input, new RegExp(`aria-describedby="${id}-hint ${id}-error"`));
  assert.match(input, /aria-invalid="true"/);
  assert.match(markup, new RegExp(`for="${id}"`));
});
