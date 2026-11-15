/**
 * 系统支持的币种清单（唯一来源）。
 *
 * 汇率服务用它决定抓哪些币种，界面下拉用它生成选项。
 * 两处各写一份迟早会漂移：某天服务能抓 SAR，界面却选不到。
 */

/** 按常用度排序，界面下拉与展示都按这个顺序 */
export const CURRENCY_CODES = [
  "USD",
  "CNY",
  "EUR",
  "GBP",
  "JPY",
  "HKD",
  "TWD",
  "KRW",
  "SGD",
  "MYR",
  "THB",
  "VND",
  "IDR",
  "PHP",
  "AUD",
  "CAD",
  "MXN",
  "BRL",
  "AED",
  "SAR",
  "INR",
  "PLN",
] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export const CURRENCY_LABELS: Record<string, string> = {
  USD: "美元",
  CNY: "人民币",
  EUR: "欧元",
  GBP: "英镑",
  JPY: "日元",
  HKD: "港币",
  TWD: "新台币",
  KRW: "韩元",
  SGD: "新加坡元",
  MYR: "马来西亚林吉特",
  THB: "泰铢",
  VND: "越南盾",
  IDR: "印尼盾",
  PHP: "菲律宾比索",
  AUD: "澳元",
  CAD: "加元",
  MXN: "墨西哥比索",
  BRL: "巴西雷亚尔",
  AED: "阿联酋迪拉姆",
  SAR: "沙特里亚尔",
  INR: "印度卢比",
  PLN: "波兰兹罗提",
};
