export const SELECTORS = {
  // Consent dialog
  consentButtons: [
    'button[aria-label="Accept all"]',
    'button[aria-label="Setuju semua"]',
    'form[action*="consent"] button',
    'button:has-text("Accept all")',
    'button:has-text("Setuju semua")',
    'button:has-text("I agree")',
    'button:has-text("Saya setuju")'
  ],

  // Profile details
  title: 'h1.DUwDvf, h1.fontHeadlineLarge, div[role="main"] h1',
  rating: 'div.F7nice span[aria-hidden="true"], span.ceNzKf, span.fontDisplayLarge',
  reviewCount: 'div.F7nice span:has-text("(") span, div.F7nice span:nth-child(2) span, button[aria-label*="review"]',
  category: 'button.DkEaL, span.DkEaL',
  address: 'button[data-item-id="address"] div.fontBodyMedium, [data-item-id="address"]',
  phone: 'button[data-item-id*="phone"] div.fontBodyMedium, [data-item-id*="phone"]',
  website: 'a[data-item-id="authority"], [data-item-id="authority"]',
  openingHoursTable: 'table.eKjhZj tr, div[data-item-id*="oh"] table tr',

  // Tabs & Reviews section
  reviewsTab: 'button[role="tab"][aria-label*="Ulasan"], button[role="tab"][aria-label*="Reviews"], button[data-tab-index="1"]',
  reviewsSortButton: 'button[aria-label*="Urutkan ulasan"], button[aria-label*="Sort reviews"], button[data-value*="Urutkan"]',
  sortOptions: {
    relevant: 'div[role="menuitemradio"]:nth-child(1), div[role="menuitemradio"][data-index="0"]',
    newest: 'div[role="menuitemradio"]:nth-child(2), div[role="menuitemradio"][data-index="1"]',
    highest: 'div[role="menuitemradio"]:nth-child(3), div[role="menuitemradio"][data-index="2"]',
    lowest: 'div[role="menuitemradio"]:nth-child(4), div[role="menuitemradio"][data-index="3"]'
  },
  reviewsScrollContainer: 'div[role="feed"], div.m6QErb.DxyBCb.kA9KIf.dS8AEf, div.m6QErb[aria-label*="Ulasan"], div.m6QErb[aria-label*="Reviews"]',

  // Single review item
  reviewCard: 'div.jftiEf',
  reviewerName: 'div.d4r55',
  reviewerLink: 'button.al6Kxe, a[data-href*="contrib"]',
  reviewRating: 'span.kvMYJc',
  reviewDate: 'span.rsqaWe',
  reviewText: 'span.wiI7m, div.MyEned span',
  reviewExpandButton: 'button.w8nwRe.kyuRq, button[aria-label="Lihat lainnya"], button[aria-label="See more"], button:has-text("Lainnya"), button:has-text("More")',
  reviewLikes: 'span.pkWtMe, button[aria-label*="orang merasa"]',
  ownerResponse: 'div.CDe7pd',
  ownerResponseText: 'div.CDe7pd div.wiI7m',
  ownerResponseDate: 'div.CDe7pd span.DHIhFt'
};
