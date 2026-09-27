import assert from "node:assert/strict";
import test from "node:test";
import {aftersalesFiltersToSearch, filterAftersales, parseAftersalesFilters} from "./aftersales.filters";
import type {AftersalesListItem} from "@/src/types/aftersales";

const item: AftersalesListItem = {id: "SH-1", salesInvoiceNo: "XS-1", customerName: "张三", contact: "138", inventoryNo: "KC-1", productName: "华硕 RTX 4090", serialNumber: "SN-001", type: "维修", status: "待处理", description: "烤机花屏", repairCost: 0, refundAmount: 0, finalResult: "", createdAt: "2026-08-10", historicalReturn: false};

test("aftersales filters round-trip through URL params", () => {const filters = parseAftersalesFilters("?keyword=4090&status=%E5%BE%85%E5%A4%84%E7%90%86&type=%E7%BB%B4%E4%BF%AE&page=2&pageSize=50"); assert.equal(filters.page, 2); assert.equal(filters.status, "待处理"); assert.equal(aftersalesFiltersToSearch(filters).get("type"), "维修");});
test("aftersales filtering searches order, customer, SN, model and description", () => {const defaults = parseAftersalesFilters(""); for (const keyword of ["SH-1", "张三", "SN-001", "4090", "花屏"]) assert.equal(filterAftersales([item], {...defaults, keyword}).length, 1); assert.equal(filterAftersales([item], {...defaults, status: "已完成"}).length, 0);});
