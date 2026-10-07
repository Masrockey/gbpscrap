export const SELECTORS = {
  // Consent dialog
  consentButtons: [
    'button[aria-label="Accept all" i]',
    'button[aria-label="Setuju semua" i]',
    'button[aria-label*="accept" i]',
    'button[aria-label*="accepteren" i]',
    'button[aria-label*="akzeptieren" i]',
    'button[aria-label*="accepter" i]',
    'button[aria-label*="aceptar" i]',
    'button[aria-label*="accetta" i]',
    'form[action*="consent"] button:last-of-type',
    'form[action*="/save"] button:last-of-type',
    'form[action*="/s"] button:last-of-type',
    'button[jsname="b3VHJd"]',
    'button:has-text("Accept all")',
    'button:has-text("Setuju semua")',
    'button:has-text("Alles accepteren")',
    'button:has-text("Alle akzeptieren")',
    'button:has-text("Tout accepter")',
    'button:has-text("Aceptar todo")',
    'button:has-text("Accetta tutto")',
    'button:has-text("I agree")',
    'button:has-text("Saya setuju")',
    'button:has-text("Ik ga akkoord")',
    'button:has-text("Ich stimme zu")',
  ],

  // Profile details
  title: 'h1.DUwDvf, h1.fontHeadlineLarge, div.TIHn2 h1, div.lMbq3e h1, div.m6QErb h1',
  rating: 'div.F7nice span[aria-hidden="true"], span.ceNzKf, span.fontDisplayLarge',
  reviewCount: 'div.F7nice span:has-text("(") span, div.F7nice span:nth-child(2) span, button[aria-label*="ulasan" i], button[aria-label*="review" i], span[aria-label*="ulasan" i], span[aria-label*="review" i], span:has-text(" ulasan")',
  category: 'button.DkEaL, span.DkEaL',
  address: 'button[data-item-id="address"] div.fontBodyMedium, [data-item-id="address"]',
  phone: 'button[data-item-id*="phone"] div.fontBodyMedium, [data-item-id*="phone"]',
  website: 'a[data-item-id="authority"], [data-item-id="authority"]',
  openingHoursDropdown: 'div.OMl5r[role="button"], div[jsaction*="openhours.wfvdle"], [aria-label*="jam buka" i], [aria-label*="opening hours" i]',
  openingHoursTable: 'table.eK4R0e tr, tr.y0skZc, table.eKjhZj tr, div[data-item-id*="oh"] table tr, div.t39EBf table tr',

  // Tabs & Reviews section
  reviewsTab: 'button[role="tab"][aria-label*="Ulasan" i], button[role="tab"][aria-label*="Reviews" i], button[role="tab"]:has-text("Ulasan"), button[role="tab"]:has-text("Reviews")',
  reviewsSortButton: 'button[aria-label*="Urutkan ulasan" i], button[aria-label*="Sort reviews" i], button[data-value*="Urutkan" i]',
  sortOptions: {
    relevant: 'div[role="menuitemradio"]:nth-child(1), div[role="menuitemradio"][data-index="0"]',
    newest: 'div[role="menuitemradio"]:nth-child(2), div[role="menuitemradio"][data-index="1"]',
    highest: 'div[role="menuitemradio"]:nth-child(3), div[role="menuitemradio"][data-index="2"]',
    lowest: 'div[role="menuitemradio"]:nth-child(4), div[role="menuitemradio"][data-index="3"]'
  },
  reviewsScrollContainer: 'div[role="feed"], div.m6QErb.DxyBCb.kA9KIf.dS8AEf, div.m6QErb[aria-label*="Ulasan" i], div.m6QErb[aria-label*="Reviews" i]',

  // Single review item
  reviewCard: 'div.jftiEf',
  reviewerName: 'div.d4r55',
  reviewerLink: 'button.al6Kxe, a[data-href*="contrib"]',
  reviewRating: 'span.kvMYJc',
  reviewDate: 'span.rsqaWe',
  reviewText: 'span.wiI7m, div.MyEned span, div.wiI7m span, div[lang] span',
  reviewExpandButton: 'button.w8nwRe.kyuRq, button[aria-label*="Lihat lainnya" i], button[aria-label*="See more" i], button:has-text("Lainnya"), button:has-text("More")',
  reviewLikes: 'span.pkWtMe, button[aria-label*="orang merasa" i], button[aria-label*="people found" i]',
  ownerResponse: 'div.CDe7pd',
  ownerResponseText: 'div.CDe7pd div.wiI7pd, div.CDe7pd div.wiI7m, div.CDe7pd div[lang]',
  ownerResponseDate: 'div.CDe7pd span.DZSIDd, div.CDe7pd span.DHIhFt'
};
