export const BRAND = {
  name: "CloudFlow",
  shortName: "CF",
  chineseName: "云流",
  productName: "Automation Control",
  tagline: "浏览器自动化编排控制台",
  description: "面向浏览器任务、调度与实时执行监控的一体化自动化平台。",
  themeColor: "#07111f",
};

export function buildPageTitle(title?: string) {
  if (!title) {
    return `${BRAND.name} | ${BRAND.tagline}`;
  }

  return `${title} | ${BRAND.name}`;
}
