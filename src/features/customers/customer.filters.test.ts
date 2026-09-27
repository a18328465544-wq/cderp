import assert from "node:assert/strict";
import test from "node:test";
import {customerFiltersToSearch, filterCustomers, parseCustomerFilters} from "./customer.filters";
import type {CustomerDirectoryItem} from "@/src/types/customer";

const customer: CustomerDirectoryItem = {id: "KH-1", name: "张三", contact: "138", source: "微信", type: "个人买家客户", level: "A级", isCoreCustomer: false, crmStatus: "已成交", totalAmount: 1000, buyCount: 1, recycleCount: 0, aftersalesCount: 0, receivableBalance: 0, payableBalance: 0, tags: ["老客户"]};

test("customer filters round-trip through URL params", () => {
  const filters = parseCustomerFilters("?keyword=138&type=%E4%B8%AA%E4%BA%BA%E4%B9%B0%E5%AE%B6%E5%AE%A2%E6%88%B7&channel=%E5%BE%AE%E4%BF%A1&level=A%E7%BA%A7&page=2&pageSize=50");
  assert.equal(filters.page, 2);
  assert.equal(customerFiltersToSearch(filters).get("level"), "A级");
  assert.equal(customerFiltersToSearch(filters).get("pageSize"), "50");
});

test("customer filtering uses domain fields and explicit filters", () => {
  const defaults = parseCustomerFilters("");
  assert.equal(filterCustomers([customer], {...defaults, keyword: "老客户"}).length, 1);
  assert.equal(filterCustomers([customer], {...defaults, channel: "闲鱼"}).length, 0);
  assert.equal(filterCustomers([customer], {...defaults, level: "A级"}).length, 1);
});
