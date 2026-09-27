import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const projectRoot = process.cwd();
const componentsDir = path.join(projectRoot, "src", "components");
const baselinePath = path.join(projectRoot, "scripts", "ui-button-baseline.json");
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
const failures = [];
const nativeCounts = {};
const tokenBypassCounts = {};

const visualClassPattern = /^(?:h-|min-h-|max-h-|p[trblxy]?-(?!0$)|bg-|border(?:-|$)|rounded(?:-|$)|shadow(?:-|$)|text-(?:white|black|slate|gray|zinc|neutral|stone|red|rose|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink)-)/;

function collectComponentFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectComponentFiles(file);
    return entry.name.endsWith(".tsx") && !/\.test\.tsx$/.test(entry.name) ? [file] : [];
  });
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function fail(file, sourceFile, node, message) {
  failures.push(`${path.relative(projectRoot, file)}:${lineOf(sourceFile, node)} ${message}`);
}

function attributesOf(node) {
  return node.attributes?.properties ?? [];
}

function findAttribute(node, name) {
  return attributesOf(node).find(
    (attribute) => ts.isJsxAttribute(attribute) && attribute.name.text === name,
  );
}

function literalAttributeValue(attribute) {
  if (!attribute?.initializer) return undefined;
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
  if (!ts.isJsxExpression(attribute.initializer)) return undefined;
  const expression = attribute.initializer.expression;
  if (expression && (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))) {
    return expression.text;
  }
  return undefined;
}

function inspectButtonComponent(file, sourceFile, node, tagName) {
  const size = literalAttributeValue(findAttribute(node, "size"));
  if (size && ["iconXs", "iconLg"].includes(size)) {
    fail(file, sourceFile, node, `${tagName} 使用了已废弃尺寸 size=\"${size}\"；请改用 xs/sm/md。`);
  }

  if (tagName === "IconButton" && !findAttribute(node, "label")) {
    fail(file, sourceFile, node, "IconButton 必须提供 label，确保图标按钮可访问。");
  }

  const className = literalAttributeValue(findAttribute(node, "className"));
  if (!className || !["Button", "IconButton"].includes(tagName)) return;
  const forbidden = className.split(/\s+/).filter((token) => visualClassPattern.test(token));
  if (forbidden.length > 0) {
    fail(
      file,
      sourceFile,
      node,
      `${tagName} 的 className 只能处理布局；视觉类 ${forbidden.join(", ")} 应由 variant/size/shape 表达。`,
    );
  }
}

function inspectFile(file) {
  const sourceText = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let nativeCount = 0;

  function visit(node) {
    const jsxNode = ts.isJsxElement(node)
      ? node.openingElement
      : ts.isJsxSelfClosingElement(node)
        ? node
        : undefined;

    if (jsxNode) {
      const tagName = jsxNode.tagName.getText(sourceFile);
      if (tagName === "button") {
        nativeCount += 1;
        if (!findAttribute(jsxNode, "type")) {
          fail(file, sourceFile, jsxNode, "原生 <button> 必须显式声明 type。业务代码优先使用统一按钮组件。");
        }
      }
      if (["Button", "IconButton"].includes(tagName)) {
        inspectButtonComponent(file, sourceFile, jsxNode, tagName);
      }
      if (tagName === "ButtonBase" && path.basename(file) !== "ui.tsx") {
        fail(file, sourceFile, jsxNode, "ButtonBase 只允许在 ui.tsx 内使用，业务层请选择语义按钮组件。");
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  if (nativeCount > 0) nativeCounts[path.relative(componentsDir, file).split(path.sep).join("/")] = nativeCount;
}

function inspectTokenUse(file) {
  const sourceText = fs.readFileSync(file, "utf8");
  const tokenBypassMatches = sourceText.match(/(?:#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\s*\(|(?:bg|text|border)-\[(?:#|rgb|rgba|hsl|hsla|color\()[^\]]+\])/g) || [];
  const rawLayerMatches = sourceText.match(/\bz-(?:\[[^\]]+\]|\d+)\b/g) || [];
  if (tokenBypassMatches.length > 0) {
    tokenBypassCounts[path.relative(projectRoot, file)] = tokenBypassMatches.length;
    failures.push(`${path.relative(projectRoot, file)} 直接写颜色值（${tokenBypassMatches.join(", ")}），请使用 Design Token。`);
  }
  if (rawLayerMatches.length > 0) {
    failures.push(`${path.relative(projectRoot, file)} 使用裸层级（${rawLayerMatches.join(", ")}），请改用 erp-popover-layer、erp-modal-layer、erp-drawer-layer 或内容层语义类。`);
  }
}

function inspectStyles(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      inspectStyles(file);
      continue;
    }
    if (!entry.name.endsWith(".css") || entry.name === "tokens.css") continue;
    const sourceText = fs.readFileSync(file, "utf8");
    const hardcodedColors = sourceText.match(/(?:#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\s*\()/g) || [];
    if (hardcodedColors.length > 0) {
      failures.push(`${path.relative(projectRoot, file)} 直接写颜色值（${hardcodedColors.join(", ")}），请将颜色放入 src/styles/tokens.css。`);
    }
  }
}

for (const file of collectComponentFiles(componentsDir).sort()) inspectFile(file);

function inspectFormalTree(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) inspectFormalTree(file);
    else if (/\.(tsx|ts)$/.test(entry.name) && !/\.test\.(tsx|ts)$/.test(entry.name)) inspectTokenUse(file);
  }
}

for (const directory of [
  path.join(projectRoot, "src", "app"),
  path.join(projectRoot, "src", "components", "ui"),
  path.join(projectRoot, "src", "components", "common"),
  path.join(projectRoot, "src", "components", "domain"),
  path.join(projectRoot, "src", "features"),
]) inspectFormalTree(directory);
inspectStyles(path.join(projectRoot, "src", "styles"));

const currentTotal = Object.values(nativeCounts).reduce((sum, count) => sum + count, 0);
const v2Baseline = baseline.v2 ?? {total: 0, files: {}};
for (const [file, count] of Object.entries(nativeCounts)) {
  const allowed = v2Baseline.files[file] ?? 0;
  if (count > allowed) {
    failures.push(`src/components/${file} 新增了 ${count - allowed} 个原生 <button>（当前 ${count}，基线 ${allowed}）。请使用语义按钮组件；仅保留可解释的键盘/选择器例外。`);
  }
}
if (currentTotal > v2Baseline.total) {
  failures.push(`V2 组件树中的原生 <button> 总数从基线 ${v2Baseline.total} 增至 ${currentTotal}，不允许回退。`);
}

if (failures.length > 0) {
  console.error(`UI 按钮契约检查失败（${failures.length} 项）：`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`UI 契约检查通过：V2 组件树原生 <button> ${currentTotal}/${v2Baseline.total}，旧版基线 ${baseline.total} 仅作历史参考；正式树已检查 Token 和交互契约。`);
