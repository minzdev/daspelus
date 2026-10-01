# Deploy DASPESLUS ke SumoPod (VPS Jakarta + MySQL Jakarta + daspelus.web.id)

## Tahap -1 — GitHub (sekali saja, dari laptop)
Repo ini belum di-`git init`. Wajib repo **PRIVATE** (kode instansi + riwayat berisi kredensial lama? cek dulu):

```bash
cd "D:\1. MAGANGHUB BPSDMP\daspeslus"
git init -b main
git add .
git status --short   # PASTIKAN tidak ada server/.env, client/.env, *.log, node_modules, dist/
git commit -m "Initial commit DASPESLUS"
# buat repo PRIVATE baru di github.com, lalu:
git remote add origin git@github.com:AKUN_ANDA/daspeslus.git
git push -u origin main
```

Lalu aktifkan auto-deploy: di repo GitHub → Settings → Secrets and variables → Actions,
isi `VPS_HOST`, `VPS_USER`, `APP_USER`→`daspeslus`, `VPS_SSH_KEY` (private key tanpa passphrase;
public key-nya sudah dipasang di VPS), `APP_DIR` (`/var/www/daspeslus`).
Sejak itu setiap `git push` ke `main` otomatis deploy (file `.github/workflows/deploy.yml`).
Deploy pertama tetap manual mengikuti tahap 1–6 di bawah (butuh `.env`, seed, Nginx, TLS).

## Tahap 0 — Pesan layanan (±15 menit)
1. **VPS**: Jakarta, Ubuntu 24.04, 2 vCPU / 4 GB / 60 GB. Catat IP publik.
2. **Database**: MySQL 8 (Shared), Jakarta, 4 GB. Catat host, port, nama DB, user, password.
3. **Domain**: register `daspelus.web.id`, lalu buat **A record → IP VPS**. Tunggu propagasi:
   `nslookup daspelus.web.id` harus menjawab IP VPS.

## Tahap 1 — Provisioning VPS (±30 menit, sebagai root)
```bash
# salin folder deploy/ ke VPS dulu (scp), lalu:
chmod +x setup-ubuntu-2404.sh backup.sh
./setup-ubuntu-2404.sh
```

## Tahap 2 — Kode aplikasi via GitHub (±20 menit, sebagai user `daspeslus`)
```bash
cd /var/www
git clone git@github.com:AKUN_ANDA/daspeslus.git daspeslus
cd daspeslus
npm run install:all
cp deploy/.env.production.example server/.env
nano server/.env   # <-- ISI: DB managed + JWT_SECRET acak (lihat bawah)
npm run build:client
```

Buat JWT secret acak:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Tahap 3 — Database (±15 menit)
Opsi A — **go-live bersih (disarankan)**: tabel dibuat otomatis saat service pertama start,
lalu isi master:
```bash
cd /var/www/daspeslus/server
node src/index.js   # biarkan jalan 10 detik, pastikan log "[db] Model tabel sinkron", lalu Ctrl+C
npm run seed
```
Opsi B — bawa data Laragon: `mysqldump -u root daspeslus --single-transaction --routines --triggers > dump.sql`,
upload ke VPS, lalu `mysql -h <host> -u <user> -p daspeslus < dump.sql`. Bersihkan data uji + ganti password.

## Tahap 4 — Nginx + HTTPS (±15 menit, sebagai root)
```bash
cp /var/www/daspeslus/deploy/nginx-daspelus.conf /etc/nginx/sites-available/daspeslus
ln -s /etc/nginx/sites-available/daspeslus /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
# SETELAH nslookup sudah menjawab IP VPS:
certbot --nginx -d daspelus.web.id --redirect --agree-tos -m admin@daspelus.web.id --no-eff-email
```

## Tahap 5 — Jalan permanen + backup (±10 menit, sebagai user `daspeslus`)
```bash
cd /var/www/daspeslus/server
pm2 start src/index.js --name daspeslus-api
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u daspeslus --hp /home/daspeslus
chmod +x /var/www/daspeslus/deploy/backup.sh
(crontab -l 2>/dev/null; echo "0 2 * * * /var/www/daspeslus/deploy/backup.sh >> /var/backups/daspeslus/backup.log 2>&1") | crontab -
```

## Tahap 6 — Go-live check (±30 menit)
1. Buka `https://daspelus.web.id` (gembok harus hijau).
2. Ganti SEMUA password default (admin + tiap UPT).
3. Uji tiap role: login → target → realisasi → kirim → pimpinan setuju → unlock → penyerapan → ekspor Excel/PDF.
4. Uji backup: jalankan `backup.sh` manual, pastikan file `.sql.gz` terbentuk.
5. Catat kredensial di tempat aman (password manager), hapus akses darurat bila ada.

## Catatan penting
- Jika MySQL managed **mewajibkan SSL**, beri tahu — perlu 3 baris tambahan di `server/src/lib/database.js`.
- App + DB wajib satu region (Jakarta–Jakarta) agar laporan tidak lambat.
- Update aplikasi berikutnya: `git pull` → `npm run build:client` → `pm2 reload daspeslus-api` (tanpa downtime).
