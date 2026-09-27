import assert from "node:assert/strict";
import test from "node:test";
import {defaultFinanceLedgerFilters, financeLedgerFiltersToSearch, parseFinanceLedgerFilters} from "./finance-ledger.filters";

test("finance ledger URL filters round-trip server-supported filters", () => {
  const parsed = parseFinanceLedgerFilters("?keyword=%E5%BC%A0%E4%B8%89&accountId=A%2F1&handler=%E9%83%AD%E9%91%AB&businessType=%E9%94%80%E5%94%AE%E6%94%B6%E6%AC%BE&direction=%E6%94%B6%E5%85%A5&relatedDocNo=XS-1&customerName=%E5%BC%A0%E5%85%88%E7%94%9F&supplierName=%E4%BE%9B%E5%BA%94%E5%95%86&dateStart=2025-05-01&dateEnd=2025-06-05&page=2&pageSize=50");
  assert.equal(financeLedgerFiltersToSearch(parsed).toString(), "keyword=%E5%BC%A0%E4%B8%89&accountId=A%2F1&handler=%E9%83%AD%E9%91%AB&businessType=%E9%94%80%E5%94%AE%E6%94%B6%E6%AC%BE&direction=%E6%94%B6%E5%85%A5&relatedDocNo=XS-1&customerName=%E5%BC%A0%E5%85%88%E7%94%9F&supplierName=%E4%BE%9B%E5%BA%94%E5%95%86&dateStart=2025-05-01&dateEnd=2025-06-05&page=2&pageSize=50");
});

test("finance ledger URL filters reject unsupported direction and pagination", () => {
  assert.deepEqual(parseFinanceLedgerFilters("?direction=未知&page=-1&pageSize=999"), defaultFinanceLedgerFilters);
});
