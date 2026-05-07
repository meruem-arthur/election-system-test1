# DEPARTMENTAL SMART ELECTION SYSTEM
## Complete Setup & Deployment Guide

---

## TABLE OF CONTENTS
1. [Project Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Local Development Setup](#local-setup)
5. [Environment Configuration](#environment)
6. [Database Setup](#database)
7. [External Services Setup](#services)
8. [Running the Application](#running)
9. [Production Deployment](#deployment)
10. [Admin First-Time Setup](#admin-setup)
11. [Running Your First Election](#first-election)
12. [Security Checklist](#security)
13. [Troubleshooting](#troubleshooting)

---

## 1. PROJECT OVERVIEW <a name="overview"></a>

The **Departmental Smart Election System** is a production-grade platform for secure,
transparent departmental elections at universities.

### Key Features
- 🔐 Secure JWT authentication with OTP verification
- 📋 CSV-based student record import
- 🗳️ Anonymous ballot casting (privacy-guaranteed)
- 📊 Live dashboard with real-time vote tracking
- 👥 Role-based admin access (Super Admin / Election Admin / Observer)
- 📱 Mobile-responsive futuristic UI
- 📄 PDF export of results
- 🔍 Full audit trail

### Privacy Architecture
```
VOTER STATUS TABLE          BALLOT TABLE
┌─────────────────┐         ┌──────────────────────┐
│ student_id ✓    │         │ candidate_id ✓        │
│ election_id ✓   │    ≠    │ position_id ✓         │
│ voted_at ✓      │         │ ballot_token (random) │
│ ip_address ✓    │         │ submitted_at ✓        │
└─────────────────┘         └──────────────────────┘
These two tables are NEVER joined.
Admin cannot link a student to their vote.
```

---

## 2. ARCHITECTURE <a name="architecture"></a>

```
┌──────────────────────────────────────────────────────┐
│                    FRONTEND                          │
│              Next.js 14 (App Router)                 │
│         Black + Green Futuristic UI                  │
│    /login  /student/vote  /admin/dashboard           │
└─────────────────────┬────────────────────────────────┘
                      │ HTTP/JSON (JWT Bearer)
┌─────────────────────▼────────────────────────────────┐
│                    BACKEND                           │
│              Node.js + Express                       │
│   Auth │ Vote │ Admin │ Results │ Audit │ Support    │
└─────────────────────┬────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
  PostgreSQL      Cloudinary    SMS/Email
  (Primary DB)   (Images)      (OTP)
```

---

## 3. PREREQUISITES <a name="prerequisites"></a>

### Required
- **Node.js** v18+ — https://nodejs.org
- **PostgreSQL** v14+ — https://postgresql.org
- **Git** — https://git-scm.com

### Required External Services
| Service | Purpose | Free Tier |
|---------|---------|-----------|
| **Cloudinary** | Candidate images | 25GB free |
| **Africa's Talking** | SMS OTP (Ghana) | Pay-per-use |
| **Gmail / SendGrid** | Email OTP | Free tier |

### Optional (for Docker)
- **Docker** + **Docker Compose** — https://docker.com

---

## 4. LOCAL DEVELOPMENT SETUP <a name="local-setup"></a>

```bash
# 1. Clone / download the project
cd election-system

# 2. Install backend dependencies
cd backend
npm install

# 3. Install frontend dependencies
cd ../frontend
npm install
```

---

## 5. ENVIRONMENT CONFIGURATION <a name="environment"></a>

### Backend (.env)
```bash
cd backend
cp .env.example .env
nano .env  # or use any text editor
```

**Critical variables to set:**
```env
# Database
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/election_db
DB_PASSWORD=yourpassword

# JWT (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_SECRET=your-64-char-random-hex-string

# Cloudinary (get from cloudinary.com dashboard)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Africa's Talking SMS (get from africastalking.com)
AT_API_KEY=your_key
AT_USERNAME=your_username

# Email (Gmail App Password recommended)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=youremail@gmail.com
SMTP_PASS=your_gmail_app_password  # NOT your normal password!
FROM_EMAIL=noreply@yourdomain.com
```

> **Gmail App Password**: Google Account → Security → 2-Step Verification → App Passwords

### Frontend (.env.local)
```bash
cd frontend
cp .env.local.example .env.local
```
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

---

## 6. DATABASE SETUP <a name="database"></a>

### Option A: Local PostgreSQL

```bash
# 1. Create database
psql -U postgres -c "CREATE DATABASE election_db;"

# 2. Run schema
psql -U postgres -d election_db -f backend/src/config/schema.sql

# Verify (should show tables)
psql -U postgres -d election_db -c "\dt"
```

### Option B: Docker PostgreSQL (easiest)
```bash
docker run -d \
  --name election_postgres \
  -e POSTGRES_DB=election_db \
  -e POSTGRES_PASSWORD=electionpass123 \
  -p 5432:5432 \
  postgres:16-alpine

# Wait 5 seconds, then run schema
sleep 5
docker exec -i election_postgres psql -U postgres -d election_db < backend/src/config/schema.sql
```

### Option C: Railway / Supabase (cloud)
1. Create a project at railway.app or supabase.com
2. Get the PostgreSQL connection string
3. Set `DATABASE_URL` in your .env
4. Run schema via their SQL editor or connection

---

## 7. EXTERNAL SERVICES SETUP <a name="services"></a>

### Cloudinary (Image Uploads)
1. Sign up at **cloudinary.com** (free)
2. Dashboard → Settings → Access Keys
3. Copy: Cloud Name, API Key, API Secret
4. Set in backend `.env`

### Africa's Talking SMS (Ghana — Recommended)
1. Sign up at **africastalking.com**
2. Go to API → API Keys
3. Create a sandbox key for testing, live key for production
4. Set `AT_API_KEY` and `AT_USERNAME` in `.env`
5. Install: `cd backend && npm install africastalking`

### Gmail SMTP (Email OTP)
1. Enable 2FA on your Gmail account
2. Google Account → Security → App Passwords
3. Generate app password for "Mail"
4. Use this password (not your Gmail password) as `SMTP_PASS`

### Twilio (Alternative SMS)
1. Sign up at **twilio.com**
2. Get Account SID, Auth Token, Phone Number
3. Set in `.env`

---

## 8. RUNNING THE APPLICATION <a name="running"></a>

### Development Mode

```bash
# Terminal 1 — Backend
cd backend
npm run dev
# Running on http://localhost:5000

# Terminal 2 — Frontend
cd frontend
npm run dev
# Running on http://localhost:3000
```

### Production Mode (Docker Compose)

```bash
# 1. Copy and configure environment
cp .env.example .env
nano .env

# 2. Build and start all services
docker-compose up -d --build

# 3. Check logs
docker-compose logs -f

# 4. Stop
docker-compose down
```

---

## 9. PRODUCTION DEPLOYMENT <a name="deployment"></a>

### Option A: Vercel (Frontend) + Railway (Backend + DB)

#### Backend on Railway
```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login and deploy
railway login
cd backend
railway init
railway up

# 3. Add PostgreSQL service in Railway dashboard
# 4. Set all environment variables in Railway dashboard
# 5. Run schema via Railway's PostgreSQL shell
```

#### Frontend on Vercel
```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Deploy
cd frontend
vercel

# 3. Set NEXT_PUBLIC_API_URL to your Railway backend URL
# e.g. https://your-app.railway.app/api
```

### Option B: VPS (Ubuntu 22.04)

```bash
# 1. Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Install PostgreSQL
sudo apt install postgresql postgresql-contrib -y
sudo systemctl start postgresql

# 3. Setup database
sudo -u postgres psql -c "CREATE USER electionadmin WITH PASSWORD 'strongpassword';"
sudo -u postgres psql -c "CREATE DATABASE election_db OWNER electionadmin;"
sudo -u postgres psql -d election_db -f /path/to/schema.sql

# 4. Install PM2 (process manager)
npm install -g pm2

# 5. Start backend
cd /var/www/election-system/backend
npm install --production
pm2 start src/index.js --name "election-api"
pm2 save
pm2 startup

# 6. Build and start frontend
cd /var/www/election-system/frontend
npm install
npm run build
pm2 start npm --name "election-frontend" -- start

# 7. Configure Nginx (reverse proxy)
```

**Nginx configuration** (`/etc/nginx/sites-available/election`):
```nginx
server {
    server_name election.yourdomain.edu.gh;

    location /api/ {
        proxy_pass http://localhost:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
# Enable site and get SSL
sudo ln -s /etc/nginx/sites-available/election /etc/nginx/sites-enabled/
sudo certbot --nginx -d election.yourdomain.edu.gh
sudo nginx -t && sudo systemctl reload nginx
```

---

## 10. ADMIN FIRST-TIME SETUP <a name="admin-setup"></a>

The schema seeds a default Super Admin. **Change this immediately after first login.**

```
Email:    superadmin@election.edu.gh
Password: Admin@2025!
```

### After First Login:
1. Go to **Settings** → Change password
2. Create additional admin accounts as needed
3. Use role-based access:
   - **Super Admin**: Full system control
   - **Election Admin**: Manage one election
   - **Observer**: Read-only monitoring

---

## 11. RUNNING YOUR FIRST ELECTION <a name="first-election"></a>

### Step-by-Step Admin Workflow

#### 1. Create Election
`Admin → Elections → New Election`
- Set title, department, academic year
- Set start and end date/time
- Status starts as **Draft**

#### 2. Add Positions
`Admin → Candidates → Add Position`

Default positions for departmental elections:
- President (order: 1)
- Vice President (order: 2)
- Secretary (order: 3)
- Financial Secretary (order: 4)
- Treasurer (order: 5)
- PRO (order: 6)
- Organizing Secretary (order: 7)

#### 3. Upload Student CSV
`Admin → Students → Upload CSV`

Required CSV format:
```csv
Full Name,Surname,Index Number,Reference Number,Level,Department,Program,Phone Number,School Email
Kwame Mensah,Mensah,SRI.41.003.019.23,9013200723,300,Computer Science,BSc Computer Science,0244123456,kmensah@stu.edu.gh
Abena Osei,Osei,SRI.41.003.020.23,9013200724,300,Computer Science,BSc Computer Science,0244123457,aosei@stu.edu.gh
```

> **Important**: Phone Number OR School Email is required for OTP verification.
> Students without either cannot complete verification.

#### 4. Add Candidates
`Admin → Candidates → Add Candidate`
- Upload photo (face-cropped automatically via Cloudinary)
- Assign to position
- **Must approve candidates** before they appear to voters

#### 5. Start Election
`Admin → Dashboard → Start Election`
- Or it starts automatically at the scheduled time
- Students can now log in and vote

#### 6. Monitor Live
`Admin → Dashboard`
- Real-time vote counts
- Turnout by level
- Who has/hasn't voted (not who they voted for)

#### 7. Close & Publish Results
`Admin → Dashboard → Stop Election → Publish Results`
- Results visible to students only after publishing
- Export PDF report

---

## 12. STUDENT VOTING FLOW

```
1. Student visits /login
2. Enters Reference Number + Temporary Password
   (Surname + last 4 digits of reference number)
   Example: Mensah0723

3. First Login → Must set new secure password
   (Requirements: uppercase, lowercase, number, special char, 8+ chars)

4. OTP sent to phone/email for identity verification
   (Only uses pre-uploaded admin contact details)

5. Student verifies OTP → Full account access

6. Sees candidates grouped by position

7. Selects one candidate per position

8. Reviews selections on confirmation screen

9. Submits vote → LOCKED (cannot vote again)

10. Receives receipt code (not linked to candidates)

Future logins: Reference Number + personal password (no OTP unless reset)
```

---

## 13. SECURITY CHECKLIST <a name="security"></a>

### Before Going Live

- [ ] Change default super admin password
- [ ] Set strong `JWT_SECRET` (32+ random characters)
- [ ] Enable HTTPS / SSL certificate
- [ ] Set `NODE_ENV=production`
- [ ] Configure `FRONTEND_URL` to your actual domain
- [ ] Test OTP delivery (email and SMS)
- [ ] Run a test election with dummy data
- [ ] Verify anonymous ballot storage (no student_id in ballots table)
- [ ] Review rate limiting settings for your expected load
- [ ] Set up database backups
- [ ] Configure firewall (only expose ports 80/443)

### Database Backup Strategy
```bash
# Automated daily backup
crontab -e

# Add this line (backs up at 2 AM daily):
0 2 * * * pg_dump -U postgres election_db | gzip > /backups/election_$(date +\%Y\%m\%d).sql.gz

# Keep last 30 days
0 3 * * * find /backups -name "election_*.sql.gz" -mtime +30 -delete
```

---

## 14. TROUBLESHOOTING <a name="troubleshooting"></a>

### Student can't receive OTP
- Verify phone/email was included in the CSV upload
- Check `otp_codes` table: `SELECT * FROM otp_codes WHERE student_id = 'uuid';`
- Test SMTP: `node -e "require('./src/services/email').sendOTPEmail('test@example.com','Test','123456')"`
- Check Africa's Talking balance for SMS

### "Account locked" error
- Go to Admin → Students → Find student → Click unlock icon
- Or: `UPDATE students SET account_locked=false, failed_login_attempts=0 WHERE reference_number='9013200723';`

### CSV upload errors
- Ensure UTF-8 encoding (especially for names with accents)
- Check column headers match exactly (case-sensitive)
- Download the CSV template from the upload page

### Vote not submitting
- Check election status: must be `active`
- Check election end time hasn't passed
- Check browser console for API errors
- Check backend logs: `pm2 logs election-api`

### Database connection errors
- Verify PostgreSQL is running: `systemctl status postgresql`
- Test connection: `psql -U postgres -d election_db -c "SELECT 1;"`
- Check `DATABASE_URL` format: `postgresql://user:password@host:5432/dbname`

### Performance under load
- Add PostgreSQL indexes (already in schema)
- Consider Redis for session caching
- Use Railway's auto-scaling or configure PM2 cluster mode:
  `pm2 start src/index.js -i max --name election-api`

---

## FOLDER STRUCTURE

```
election-system/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.js         # PostgreSQL pool
│   │   │   └── schema.sql          # Full DB schema
│   │   ├── middleware/
│   │   │   └── auth.js             # JWT verification
│   │   ├── routes/
│   │   │   ├── auth.js             # Login, OTP, password
│   │   │   ├── admin.js            # All admin operations
│   │   │   ├── vote.js             # Cast votes (anonymous)
│   │   │   ├── result.js           # Results + PDF export
│   │   │   ├── audit.js            # Audit log access
│   │   │   └── support.js          # Support tickets
│   │   ├── services/
│   │   │   ├── otp.js              # OTP generate/verify
│   │   │   ├── email.js            # SMTP/SendGrid
│   │   │   ├── sms.js              # Africa's Talking/Twilio
│   │   │   └── audit.js            # Log writer
│   │   └── utils/
│   │       └── logger.js           # Winston logger
│   ├── Dockerfile
│   ├── package.json
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx            # Root redirect
│   │   │   ├── login/page.tsx      # Student login
│   │   │   ├── student/
│   │   │   │   ├── vote/page.tsx           # Voting UI
│   │   │   │   ├── change-password/page.tsx
│   │   │   │   ├── verify-otp/page.tsx
│   │   │   │   └── support/page.tsx
│   │   │   └── admin/
│   │   │       ├── login/page.tsx
│   │   │       ├── dashboard/page.tsx      # Live stats
│   │   │       ├── elections/page.tsx
│   │   │       ├── students/page.tsx       # CSV upload
│   │   │       ├── candidates/page.tsx
│   │   │       ├── results/page.tsx
│   │   │       ├── audit/page.tsx
│   │   │       ├── support/page.tsx
│   │   │       └── settings/page.tsx
│   │   ├── components/
│   │   │   └── AdminLayout.tsx     # Sidebar navigation
│   │   ├── lib/
│   │   │   └── api.ts              # All API calls
│   │   └── app/globals.css         # Theme + components
│   ├── Dockerfile
│   ├── next.config.js
│   ├── tailwind.config.js
│   └── package.json
│
├── docker-compose.yml
└── SETUP.md
```

---

## SUPPORT

For deployment support or custom modifications:
- Review the audit logs for any errors
- Check `backend/logs/error.log`
- Database queries can be run directly for debugging

---

*Departmental Smart Election System — Built for transparency, security, and trust.*
