# DASPESLUS — Data Peserta & Lulusan Taruna

Sistem web pengumpulan data **peserta** dan **lulusan** taruna dari Unit Pelaksana Teknis (UPT) di lingkungan **BPSDMP Kementerian Perhubungan**, lengkap dengan penetapan target **Perjanjian Kinerja (PK)** dan monitoring capaian.

## ✦ Fitur

| Modul | Admin BPSDMP | User UPT |
|---|---|---|
| Login (Firebase Auth) | ✅ | ✅ |
| Dashboard & grafik | Monitoring seluruh UPT | Capaian PK sendiri |
| Data UPT | CRUD + aktif/nonaktif | — |
| Manajemen Pengguna | Buat akun, aktif/nonaktif, reset password | — |
| Target PK | Input target tahunan per UPT | Lihat target |
| Realisasi | Monitoring rekap semua UPT | Input bulanan per jenis kelamin (L/P), **total otomatis** |
| Capaian | Status Tercapai/Belum per UPT | Status Tercapai/Belum per bulan |

## ✦ Tech Stack

- **Frontend**: React 19 (Vite) · Tailwind CSS v3 · React Router · Recharts · Axios
- **Backend**: Node.js + Express (REST API)
- **Auth**: Firebase Authentication (Email/Password)
- **Database**: Cloud Firestore — diakses **hanya** lewat backend via Firebase Admin SDK

```
React ──login──▶ Firebase Auth
React ──/api──▶ Node.js Express ──Admin SDK──▶ Firestore
```

> Aturan keamanan Firestore dikunci penuh (`allow read, write: if false`) di `firestore.rules` — semua data mengalir lewat backend yang memvalidasi token Firebase.

## ✦ Struktur Folder

```
daspeslus/
├── client/                 # React + Vite + Tailwind
│   └── src/
│       ├── components/     # AppShell (sidebar navy), icons, ui (StatCard, Modal, dll)
│       ├── context/        # AuthContext
│       ├── lib/            # firebase client, axios api
│       ├── pages/
│       │   ├── login/
│       │   ├── admin/      # Dashboard, DataUpt, TargetPk, Monitoring, Pengguna
│       │   └── upt/        # Dashboard capaian, Input Realisasi, Riwayat
│       ├── routes/         # guard role
│       └── utils/          # format angka/bulan/status
├── server/
│   ├── scripts/seed.js     # buat admin pertama + UPT contoh
│   └── src/
│       ├── lib/            # firebase-admin, logika capaian PK
│       ├── middleware/     # verifikasi ID token + role
│       └── routes/         # auth, upts, users, targets, realizations, dashboard
└── firestore.rules         # kunci penuh akses Firestore
```

## ✦ Setup (Pertama Kali)

### 1. Buat Project Firebase

1. Buka [console.firebase.google.com](https://console.firebase.google.com) → **Add project** (mis. `daspeslus`).
2. **Build → Authentication → Get started** → aktifkan metode **Email/Password**.
3. **Build → Firestore Database → Create database** → pilih lokasi (mis. `asia-southeast2`).
4. **Project Settings → General → Your apps → Web app** → daftarkan app, salin `firebaseConfig`.
5. **Project Settings → Service accounts → Generate new private key** → simpan sebagai `server/serviceAccountKey.json`.

### 2. Deploy Security Rules

Salin isi `firestore.rules` ke **Firestore Database → Rules** lalu publish.

### 3. Install Dependensi

```powershell
npm run install:all
```

### 4. Konfigurasi Environment

**`client/.env`** (salin dari `.env.example`):

```env
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=daspeslus.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=daspeslus
VITE_FIREBASE_STORAGE_BUCKET=daspeslus.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abc123
VITE_API_URL=/api
```

**`server/.env`** (salin dari `.env.example`):

```env
PORT=8787
FIREBASE_SERVICE_ACCOUNT_PATH=D:/1. MAGANGHUB BPSDMP/daspeslus/server/serviceAccountKey.json
SEED_ADMIN_EMAIL=admin@bpsdmp.dephub.go.id
SEED_ADMIN_PASSWORD=admin12345
```

### 5. Seed Admin & Data Contoh

```powershell
cd server
npm run seed
```

Script ini membuat:
- Akun **admin pertama** (sesuai `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`)
- 5 UPT contoh (STIP Jakarta, PIP Semarang, PIP Makassar, Poltekpel Surabaya, BP2TD Palembang)
- Target PK contoh tahun berjalan (1.200 peserta / 600 lulusan per UPT)

### 6. Jalankan Development

Buka **dua terminal**:

```powershell
# Terminal 1 — backend (port 8787)
cd server
npm run dev

# Terminal 2 — frontend (port 5173)
cd client
npm run dev
```

Buka `http://localhost:5173` → login dengan akun admin hasil seed.

## ✦ Alur Penggunaan

### Admin BPSDMP
1. Login → Dashboard monitoring (grafik + capaian per UPT).
2. **Data UPT**: daftarkan seluruh UPT.
3. **Manajemen Pengguna**: buat akun untuk tiap UPT (nama, email, password).
4. **Target PK**: isi target peserta & lulusan tahunan per UPT.
5. **Monitoring Realisasi**: pantau laporan masuk per tahun/bulan/UPT.

### User UPT
1. Login dengan akun dari admin.
2. **Input Realisasi**: pilih tahun & bulan → isi Peserta L/P dan Lulusan L/P → **total otomatis terhitung** → Simpan.
3. Mengisi bulan yang sama akan **memperbarui** data lama (upsert).
4. **Dashboard Capaian**: lihat progress terhadap target PK + status per bulan.

## ✦ Logika Capaian PK

Untuk bulan ke-`m` pada tahun berjalan:

- `totalPeserta = pesertaL + pesertaP`, `totalLulusan = lulusanL + lulusanP`
- **Realisasi kumulatif** = jumlah bulan 1 s.d. `m`
- **Target proporsional** = `target_tahunan × m ÷ 12`
- Status bulan: **TERCAPAI** bila kumulatif ≥ target proporsional, selain itu **BELUM TERCAPAI**
- Status tahunan: **TERCAPAI** bila kumulatif ≥ target tahunan
- Tanpa target → **TARGET BELUM DIATUR**

## ✦ Produksi

```powershell
cd client
npm run build        # hasil di client/dist (hosting: Firebase Hosting/Nginx/Vercel)
```

- Set `VITE_API_URL` ke URL API produksi sebelum build.
- Jalankan `server` dengan Node.js (PM2/Docker/App Engine) + env service account.
