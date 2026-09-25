# Google Business Profile & Review Scraper API

Layanan REST API untuk scraping data profil bisnis (Google Business Profile) dan ulasan (reviews) dari Google Maps menggunakan pustaka web crawling [Crawlee](https://github.com/apify/crawlee.git) (Playwright), framework Fastify, dan dokumentasi interaktif **OpenAPI 3.0 (Swagger UI)**.

---

## Fitur Utama

- **Google Business Profile Scraper**: Ekstraksi nama bisnis, rating rata-rata, total ulasan, kategori bisnis, alamat lengkap, nomor telepon, situs web, jam buka operasional, link Google Maps, dan koordinat lintang/bujur.
- **Reviews Scraper**: Ekstraksi nama pengulas, URL profil, rating bintang (1–5), waktu ulasan, teks ulasan lengkap (otomatis klik *Lainnya* / *See more*), jumlah suka/helpful, dan balasan dari pemilik bisnis jika tersedia.
- **Auto-scroll & Sort**: Pengambilan ulasan dinamis dengan scrolling otomatis pada panel ulasan Google Maps serta opsi filter urutan (`newest`, `highest`, `lowest`, `relevant`).
- **Synchronous & Asynchronous Mode**:
  - **Sync**: Cocok untuk scraping cepat langsung mengembalikan data JSON.
  - **Async (Job Queue)**: Menghasilkan `jobId` untuk scraping ulasan dalam jumlah banyak tanpa risiko HTTP timeout.
- **Proxy Pool & Auto-Rotation**: Menggunakan daftar proxy publik otomatis dari [Proxifly](https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/all/data.json) (>25.000 proxy). Dilengkapi **fast TCP pre-validation** dan **otomatis mengganti/meretire proxy yang mati atau diblokir Google** tanpa menghentikan proses crawling.
- **OpenAPI & Swagger UI**: Dokumentasi otomatis OpenAPI 3.0 dan UI interaktif di `/docs`.

---

## Instalasi & Menjalankan

### 1. Prasyarat
- Node.js v18+ (disarankan Node.js v20+)
- Browser Chromium untuk Playwright (diinstall via CLI)

### 2. Instalasi Dependensi
```bash
npm install
npx playwright install chromium
```

### 3. Menjalankan Server

**Mode Pengembangan (Dev / Watch):**
```bash
npm run dev
```

**Mode Produksi:**
```bash
npm run build
npm start
```

Server akan berjalan di `http://localhost:3000`.

---

## Dokumentasi API & OpenAPI (Swagger UI)

- **Swagger UI Interaktif**: [http://localhost:3000/docs](http://localhost:3000/docs)
- **Spesifikasi OpenAPI JSON**: [http://localhost:3000/openapi.json](http://localhost:3000/openapi.json)

---

## Format Input Request (Apify-Style)

API mendukung format input ala Apify Google Maps Scraper dengan parameter fleksibel:

```json
{
  "language": "id",
  "maxReviews": 5,
  "personalData": false,
  "placeIds": [
    "ChIJxxxxxxxxx"
  ],
  "reviewsStartDate": "2026-01-01",
  "startUrls": [
    {
      "url": "https://maps.app.goo.gl/q5Q1NgmEvVk1a86a9"
    }
  ]
}
```

### Penjelasan Parameter:
- **`language`** *(string, default: "id")*: Kode bahasa antarmuka Google Maps (misal `"id"` atau `"en"`).
- **`maxReviews`** *(integer, default: 5)*: Batas maksimum ulasan per tempat.
- **`personalData`** *(boolean, default: false)*:
  - `false`: Anonimkan data pribadi pengulas (`author` menjadi `"Google user"`, `authorProfileUrl` menjadi `null`).
  - `true`: Sertakan nama asli dan tautan profil pengulas.
- **`placeIds`** *(array of string)*: Daftar Google Maps Place ID.
- **`reviewsStartDate`** *(string, format "YYYY-MM-DD")*: Filter ulasan; hanya ulasan yang dipublikasikan pada atau setelah tanggal ini yang akan diambil.
- **`startUrls`** *(array of object `{ url }`)*: Daftar URL atau shortlink Google Maps yang ingin di-scrape.
- **`sortBy`** *(string, enum: `["newest", "highest", "lowest", "relevant"]`, default: "newest")*: Urutan ulasan.
- **`useProxy`** *(boolean, default: true)*: Gunakan proxy otomatis dari pool Proxifly untuk menghindari rate limit Google.
- **`proxyUrl`** *(string, opsional)*: URL proxy khusus (misal `http://user:pass@host:port` atau `socks5://host:port`) jika ingin menggunakan proxy sendiri.
- **`proxyUrls`** *(array of string, opsional)*: Daftar URL proxy kustom untuk dirotasi.
- **`query` / `url`** *(string, fallback)*: Kueri pencarian teks atau URL tunggal (tetap didukung untuk kompatibilitas).

---

## Daftar Endpoint

### 1. `POST /api/scrape/profile`
Scraping metadata profil bisnis Google.

**Request Body:**
```json
{
  "startUrls": [
    { "url": "https://maps.app.goo.gl/q5Q1NgmEvVk1a86a9" }
  ],
  "language": "id"
}
```

---

### 2. `POST /api/scrape/reviews`
Scraping daftar ulasan bisnis.

**Request Body:**
```json
{
  "language": "id",
  "maxReviews": 5,
  "personalData": false,
  "reviewsStartDate": "2026-01-01",
  "startUrls": [
    { "url": "https://maps.app.goo.gl/q5Q1NgmEvVk1a86a9" }
  ]
}
```

**Contoh Response:**
```json
{
  "success": true,
  "data": {
    "businessName": "Astra Motor Nusa Tenggara Barat",
    "placeUrl": "https://www.google.com/maps/place/...",
    "totalScraped": 2,
    "reviews": [
      {
        "author": "Google user",
        "authorProfileUrl": null,
        "rating": 5,
        "relativeTime": "4 bulan lalu",
        "publishedAtDate": "2026-05-22T07:32:12.295Z",
        "text": "Kenyamanan dan Pelayanan yg luar biasa baik",
        "likes": 0,
        "ownerResponse": null
      }
    ]
  }
}
```

---

### 3. `POST /api/scrape/full`
Scraping profil bisnis dan ulasan secara bersamaan dalam satu sesi browser.

**Request Body:**
```json
{
  "language": "id",
  "maxReviews": 10,
  "personalData": true,
  "startUrls": [
    { "url": "https://maps.app.goo.gl/q5Q1NgmEvVk1a86a9" }
  ]
}
```

---

### 4. Background Job (Asynchronous)

#### a. Buat Job: `POST /api/scrape/jobs`
```json
{
  "type": "reviews",
  "language": "id",
  "maxReviews": 50,
  "personalData": false,
  "reviewsStartDate": "2026-01-01",
  "startUrls": [
    { "url": "https://maps.app.goo.gl/q5Q1NgmEvVk1a86a9" }
  ]
}
```

Response (HTTP 202 Accepted):
```json
{
  "success": true,
  "jobId": "f784a621-e0c1-4545-9a4d-ef371804f85e",
  "status": "queued",
  "checkUrl": "/api/scrape/jobs/f784a621-e0c1-4545-9a4d-ef371804f85e",
  "createdAt": "2026-09-22T06:30:00.000Z"
}
```

#### b. Cek Status Job: `GET /api/scrape/jobs/:id`
```json
{
  "jobId": "f784a621-e0c1-4545-9a4d-ef371804f85e",
  "type": "full",
  "status": "completed",
  "createdAt": "2026-09-22T06:30:00.000Z",
  "updatedAt": "2026-09-22T06:30:25.000Z",
  "error": null,
  "result": { ... }
}
```

---

### 5. `GET /api/proxy/stats`
Melihat status proxy pool (jumlah proxy yang dimuat dari Proxifly, jumlah proxy yang terdeteksi mati, dsb).

**Contoh Response:**
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "totalLoaded": 27583,
    "deadCount": 87,
    "lastFetchedAt": "2026-09-25T07:01:47.906Z",
    "sourceUrl": "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/all/data.json"
  }
}
```

---

## Konfigurasi Environment Variable

Dapat diatur melalui file `.env` atau system environment variables:

| Variable | Default | Deskripsi |
|---|---|---|
| `PORT` | `3000` | Port server Fastify |
| `HOST` | `0.0.0.0` | Host bind address |
| `HEADLESS` | `true` | Jalankan browser secara headless (`false` untuk debug UI) |
| `USE_PROXY` | `true` | Aktifkan proxy pool otomatis |
| `PROXY_LIST_URL` | `https://cdn.jsdelivr.net/.../data.json` | URL sumber proxy Proxifly |
| `PROXY_POOL_SIZE` | `1000` | Jumlah kandidat proxy acak yang diambil per siklus |
| `DEFAULT_MAX_REVIEWS` | `20` | Jumlah default review yang di-scrape jika tidak ditentukan |
| `MAX_REVIEWS_LIMIT` | `200` | Batas maksimum review per request sync |
| `NAV_TIMEOUT_SECS` | `60` | Batas timeout navigasi browser Crawlee (detik) |

