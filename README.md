# Discord Habit Buddy – Pelacak Kebiasaan Berbasis LLM 🤖💪

Discord Habit Buddy adalah bot Discord bergaya quest master yang membantu kamu menuntaskan kebiasaan harian. Bot ini berbicara secara alami, memutuskan kapan harus memanggil “tool” untuk memodifikasi data kebiasaan, dan memberi semangat ala gamer agar combo streak tetap hidup. Semua berjalan dengan Google Gemini lewat SDK `@google/genai`, tanpa cloud database eksternal—data disimpan lokal di SQLite.

---

## ✨ Sorotan Utama

- **Bahasa natural fleksibel** – “Aku barusan selesai olahraga” langsung dipahami sebagai tanda selesai quest.
- **Progress digamifikasi** – setiap kebiasaan jadi quest, XP bertambah, level naik, combo streak dan badge terbuka otomatis.
- **Agen MCP ringan** – aturan sistem prompt memastikan Gemini hanya memanggil tool ketika perlu, sisanya membalas obrolan.
- **Data lokal** – file SQLite berada di folder `data/`, tetap aman di mesinmu.
- **Pengingat harian opsional** – jadwal cron bawaan siap mengirim DM setiap pagi.
- **Mode CLI** – utak-atik agent tanpa Discord, langsung dari terminal.
- **Unit test Jest** – meliputi logika streak DB dan helper gamifikasi.

Teknologi: **Node.js**, **discord.js v14**, **@google/genai (Gemini)**, **SQLite**.

---

## 📁 Struktur Proyek

```
discord-habit-buddy/
├── data/                 # basis data SQLite (dibuat saat runtime)
├── logs/                 # log aktivitas bot
├── scripts/
│   └── initDb.js         # skrip inisialisasi DB
├── src/
│   ├── handlers/
│   │   └── agentHandler.js   # otak LLM + aturan MCP
│   ├── models/
│   │   └── habitModel.js     # operasi CRUD kebiasaan + perhitungan streak
│   ├── scheduler/
│   │   └── reminders.js      # pengingat harian
│   ├── utils/
│   │   ├── db.js             # helper koneksi SQLite
│   │   └── logger.js         # util logging sederhana
│   └── index.js              # titik masuk bot Discord
├── tests/
│   ├── agentHandler.test.js  # test helper gamifikasi
│   └── habitModel.test.js    # test model kebiasaan
├── .env.example              # contoh variabel lingkungan
├── package.json
└── README.md
```

---

## ⚙️ Langkah Setup & Menjalankan

### 1. Prasyarat

- Node.js ≥ 16.9.0
- Git
- Akun Discord (untuk membuat bot + DM)
- Akun Google AI Studio (untuk Gemini API key)

### 2. Buat Bot Discord

1. Masuk ke [Discord Developer Portal](https://discord.com/developers/applications) dan buat **New Application**.
2. Buka tab **Bot**, klik **Add Bot**, lalu salin **Bot Token**.
3. Aktifkan **MESSAGE CONTENT INTENT** di bagian Privileged Gateway Intents.
4. Pada **OAuth2 → URL Generator**, pilih scope `bot` dan izin `Send Messages`, `Read Message History`.
5. Gunakan URL tersebut untuk mengundang bot ke servermu (DM akan menjadi jalur utama).

### 3. Kloning & Instal Dependensi

```bash
git clone https://github.com/johanpramudito/habbit-buddy-llm.git
cd discord-habit-buddy
npm install
```

### 4. Konfigurasi Variabel Lingkungan

```bash
cp .env.example .env   # sesuaikan perintah di Windows
```

Isi file `.env`:

```ini
DISCORD_BOT_TOKEN=...   # token dari Discord Developer Portal
GEMINI_API_KEY=...      # API key dari Google AI Studio
# opsi jika ingin pakai model lain
# GEMINI_MODEL=gemini-2.5-flash
LOG_LEVEL=info
```

> **Penting:** jangan pernah commit `.env` ke repository publik.

### 5. Inisialisasi Database

```bash
npm run init-db
```

Perintah ini membuat `data/habits.sqlite` serta tabel yang dibutuhkan.

### 6. Jalankan Bot

```bash
npm start
```

Jika berhasil, log akan menampilkan “Bot is ready!”. Kirim DM ke bot untuk mulai mencatat quest harianmu.

---

## 🖥️ Mode CLI

Mau mencoba tanpa Discord? Jalankan:

```bash
npm run cli
```

Ketik pesan, tekan Enter, dan gunakan `exit` untuk keluar. Semua logika MCP + gamifikasi tetap sama seperti di Discord.

---

## 🧪 Testing

Jalankan unit test:

```bash
npm test
```

Menguji streak harian, undo entri, hitung XP/level, badge, hingga pembentukan payload untuk Gemini.

---

## 💬 Contoh Interaksi

```
👤 Kamu : tambah quest "jalan pagi"
🤖 Buddy: [Quest Accepted] Quest "Jalan Pagi" resmi dibuka. Mulai kumpulkan XP pertamamu hari ini!

👤 Kamu : selesai jalan pagi barusan
🤖 Buddy: [Quest Clear] Quest "Jalan Pagi" clear! +50 XP (Total 50 XP). Level 1. Combo streak 1x aktif. Belum ada badge combo. 450 XP lagi menuju level 2.

👤 Kamu : status
🤖 Buddy: [Quest Log]
          - Jalan Pagi: Lv 1 | 50 XP | Combo 1x. Belum ada badge combo. 450 XP lagi ke level 2.
```

---

## 🆚 Mengapa Bot Baru Lebih Hebat? (4 Contoh Nyata)

1. **Mengerti bahasa natural yang berantakan**

   - Bot lama butuh format kaku `tambah baca buku`.
   - Bot baru paham “Hei buddy, tolong daftarin kebiasaan baru ya. Namanya ‘baca buku 15 menit’.”  
     Gemini mendeteksi intent `add_habit`, mengirim JSON tool call ke MCP, lalu habit disimpan.

2. **Menangkap maksud ganda dalam satu kalimat**

   - Pesan: “Gila, hari ini stres banget di kantor. Tapi untungnya aku sudah selesai olahraga.”
   - Bot lama fokus pada curhat dan lupa menandai olahraga selesai.
   - Bot baru memprioritaskan tool call, menandai habit selesai, baru kemudian bisa menanggapi emosi jika perlu.

3. **Bisa memberi alasan / penjelasan**

   - Pertanyaan: “Kenapa streak ‘baca buku’ aku 0?”
   - Bot lama kebingungan.
   - Bot baru menjelaskan bahwa streak dihitung dari hari berturut-turut, mungkin kamu lupa mencatat kemarin, ayo mulai lagi.

4. **Berperan sebagai coach, bukan sekadar pencatat**
   - Pesan: “Aku mau mulai kebiasaan ‘meditasi’, tapi gampang terdistraksi. Ada tips?”
   - Bot baru menambahkan kebiasaan lewat tool call, lalu memberi saran motivasi: mulai 5 menit, sadar saat pikiran melayang, fokus balik ke napas.

Hasilnya, Habit Buddy versi LLM ini bisa memahami gaya bicara alami, melakukan reasoning sederhana, sekaligus menjadi teman yang memberi insight—bukan hanya mesin pencatat kebiasaan.

---

## 🎬 Demo Aplikasi

![Demo Interaksi 1](./videollm1.gif)
![Demo Interaksi 2](./videollm2.gif)
---

Selamat berburu XP! Jaga combo streak, kumpulkan badge Mythic Combo, dan pastikan setiap hari berakhir dengan **Quest Clear!**
