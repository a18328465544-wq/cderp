import {productModelCode, productSearchTerms} from "../src/utils/productSearch.ts";

type Binder = (value: string) => string;

export type ProductSearchSqlFields = {
  id: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  version: string;
  vram: string;
};

/** Parameterized counterpart of productSearchMatches, shared by products and stock cards. */
export function productIdentitySearchSql(fields: ProductSearchSqlFields, keyword: string, bind: Binder) {
  const terms = productSearchTerms(keyword);
  if (!terms.length) return keyword.trim() ? ["FALSE"] : [];
  const identity = `LOWER(NORMALIZE(CONCAT_WS(' ', ${fields.id}, ${fields.name}, ${fields.category}, ${fields.brand}, ${fields.model}, ${fields.version}, ${fields.vram}), NFKC))`;
  const compact = `REGEXP_REPLACE(${identity}, '[[:space:][:punct:]，。、·・：；（）【】《》“”‘’—]+', '', 'g')`;
  const clauses = terms.map((term) => {
    const raw = bind(term);
    const compactTerm = bind(term.replace(/[\s·/_|,.-]+/g, ""));
    return `(POSITION(${raw} IN ${identity}) > 0 OR POSITION(${compactTerm} IN ${compact}) > 0)`;
  });
  const modelCode = productModelCode(keyword);
  if (modelCode) {
    // Match the explicit model when it contains a GPU code; a kit/PC may
    // instead mention the installed GPU only in its display name.
    const model = `LOWER(CASE WHEN COALESCE(${fields.model}, '') ~ '[1-9][0-9](00|50|60|70|80|90)(?![0-9])' THEN ${fields.model} ELSE COALESCE(${fields.name}, '') END)`;
    // The suffix is part of the model identity, even when separated by a space.
    const suffix = modelCode.slice(4).split("").join("[[:space:]_-]*");
    const pattern = `(^|[^0-9])(?:rtx|gtx|rx)?[[:space:]_-]*${modelCode.slice(0, 4)}[[:space:]_-]*${suffix}(?![[:space:]_-]*(?:ti|super|xtx|xt|d|s|v2))($|[^a-z0-9])`;
    clauses.push(`${model} ~ ${bind(pattern)}`);
  }
  return clauses;
}

export function productSearchSql(alias: string, keyword: string, bind: Binder) {
  return productIdentitySearchSql({
    id: `${alias}.id`,
    name: `${alias}.data->>'name'`,
    category: `${alias}.data->>'category'`,
    brand: `${alias}.data->>'brand'`,
    model: `${alias}.data->>'model'`,
    version: `${alias}.data->>'version'`,
    vram: `${alias}.data->>'vram'`,
  }, keyword, bind);
}
