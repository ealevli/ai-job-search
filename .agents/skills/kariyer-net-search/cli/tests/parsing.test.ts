import { expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { slugify, parseAgeDays, parseJobCards, parseJobDetail } from "../src/helpers.js";

test("slugify transliterates Turkish letters and collapses non-alphanumerics", () => {
  expect(slugify("Diyetisyen İstanbul")).toBe("diyetisyen-istanbul");
  expect(slugify("Klinik Diyetisyen (İstanbul)")).toBe("klinik-diyetisyen-istanbul");
  expect(slugify("Yazılım Geliştirici - Şişli/Ümraniye")).toBe("yazilim-gelistirici-sisli-umraniye");
  expect(slugify("  çÇğĞıİöÖşŞüÜ  ")).toBe("ccggiioossuu");
});

test("parseAgeDays reads 'X gün' as N days and 'X saat'/'X dakika' as same-day", () => {
  expect(parseAgeDays("19 gün")).toBe(19);
  expect(parseAgeDays("3 gün")).toBe(3);
  expect(parseAgeDays("22 saat")).toBe(0);
  expect(parseAgeDays("45 dakika")).toBe(0);
});

test("parseAgeDays returns null for ambiguous badge text rather than guessing", () => {
  expect(parseAgeDays("Son gün")).toBeNull();
  expect(parseAgeDays("güncel")).toBeNull();
  expect(parseAgeDays(null)).toBeNull();
});

test("parseJobCards extracts real fields from a live search-results excerpt", () => {
  const html = readFileSync(join(import.meta.dir, "fixtures/search-results-excerpt.html"), "utf-8");
  const cards = parseJobCards(html);
  expect(cards.length).toBe(2);

  expect(cards[0]!.id).toBe("2341255");
  expect(cards[0]!.title).toBe("Diyetisyen");
  expect(cards[0]!.company).toBe("Naturel Yemek Gıda Temizlik ve Eğitim San. Tic. L");
  expect(cards[0]!.location).toBe("İstanbul(Asya)");
  expect(cards[0]!.date).toBe("19 gün");
  expect(cards[0]!.url).toBe(
    "https://www.kariyer.net/is-ilani/naturel-yemek-gida-temizlik-ve-egitim-san-tic-l-diyetisyen-2341255",
  );

  expect(cards[1]!.id).toBe("4566988");
  expect(cards[1]!.date).toBe("6 gün");

  // No field is ever omitted — missing values are null, per the portal-skill
  // JSON-output contract (add-portal.md).
  for (const c of cards) {
    expect(c.id).not.toBeNull();
    expect(c.title).not.toBeNull();
    expect(c.url).not.toBeNull();
  }
});

test("parseJobDetail extracts title, company, location, date and a clean description from a live excerpt", () => {
  const html = readFileSync(join(import.meta.dir, "fixtures/detail-page-excerpt.html"), "utf-8");
  const job = parseJobDetail(html, "2341255", "https://www.kariyer.net/is-ilani/x-2341255");

  expect(job.title).toBe("Diyetisyen");
  expect(job.company).toBe("Naturel Yemek Gıda Temizlik ve Eğitim San. Tic. L");
  expect(job.location).toBe("İstanbul(Asya)");
  expect(job.date).toBe("19 gün önce yayınlandı");
  expect(job.experienceLevel).toBe("1 - 2 yıl arası");
  expect(job.educationLevel).toBe("Üniversite(Mezun)");
  expect(job.isActive).toBe(true);

  // The description must be plain, readable text: entities decoded, tags
  // stripped, no raw HTML or (cid:)-style garbage.
  expect(job.description).toContain("İş Tanımı");
  expect(job.description).toContain("HACCP standartları");
  expect(job.description).not.toContain("<p>");
  expect(job.description).not.toContain("&nbsp;");
});
