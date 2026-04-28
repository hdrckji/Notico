# 🚀 Guide de Démarrage Rapide

Bienvenue sur le **Supplier Delivery Appointment Management System** !

## ⚡ Étapes Rapides (5 minutes)

### **1. Backend - Installation & Configuration**

```bash
cd backend

# Installer les dépendances
npm install

# Créer le fichier .env
cp .env.example .env

# ⚠️ IMPORTANT: Éditer .env avec vos paramètres:
# - DATABASE_URL: postgresql://user:password@localhost:5432/supplier_appointments
# - JWT_SECRET: Une clé complexe
# - SMTP_*: Pour les emails (optionnel au démarrage)
```

### **2. Database - PostgreSQL Setup**

```bash
# Option 1: PostgreSQL local
createdb supplier_appointments
psql supplier_appointments

# Option 2: PostgreSQL Cloud
# - Créer un compte sur: https://railway.app ou https://render.com
# - Copier l'URL de connexion dans DATABASE_URL

# Générer le client Prisma
npm run prisma:generate

# Créer les tables
npm run prisma:migrate
# Nom: initial_schema
```

### **3. Backend - Lancer le serveur**

```bash
npm run dev
# ✅ Serveur sur http://localhost:5000
# Test: curl http://localhost:5000/health
```

### **4. Frontend - Installation**

```bash
cd ../frontend
npm install
npm run dev
# ✅ Frontend sur http://localhost:3000
```

---

## 🔐 Accès par Rôle

| Rôle | URL | Email/Login |
|------|-----|-------------|
| **Fournisseur** | http://localhost:3000/supplier/login | À créer en Admin |
| **Logistique** | http://localhost:3000/employee | Créé en Admin |
| **Admin** | http://localhost:3000/admin | Créé en Admin |

---

## 📝 Créer les Premiers Utilisateurs

### **Via Admin API** (recommandé)

```bash
# 1. Créer un Admin (manuel via DB ou script)
# Ajouter directement en DB:
INSERT INTO internal_users (id, email, password, "firstName", "lastName", role)
VALUES ('admin1', 'admin@notico.com', '$2a$10$...', 'Admin', 'System', 'ADMIN');

# 2. Login Admin
curl -X POST http://localhost:5000/api/auth/internal/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@notico.com",
    "password": "votre-mot-de-passe"
  }'

# 3. Copier le token reçu
# Utiliser avec: Authorization: Bearer <token>

# 4. Créer un Fournisseur
curl -X POST http://localhost:5000/api/admin/suppliers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "name": "ACME Corp",
    "email": "contact@acme.com",
    "phone": "01234567890",
    "address": "123 Rue de la Logistique",
    "city": "Paris",
    "postalCode": "75001",
    "contact": "John Doe",
    "maxDailyVolume": 100
  }'
```

---

## 📂 Structure du Projet

```
backend/
├── src/
│   ├── server.ts          # Point d'entrée Express
│   ├── config/            # Configuration (DB, JWT, Email)
│   ├── middleware/        # Auth & validation
│   ├── routes/            # API endpoints
│   └── services/          # Logique métier (à implémenter)
├── prisma/
│   └── schema.prisma      # Schéma base de données
└── .env.example           # Variables d'environnement

frontend/
├── src/
│   ├── pages/             # Pages par rôle (Supplier, Employee, Admin)
│   ├── store/             # État global (Zustand)
│   ├── services/          # Appels API
│   └── components/        # Composants React (à créer)
├── index.html             # HTML racine
└── vite.config.ts         # Configuration Vite
```

---

## 🔌 API Endpoints Disponibles

### **Authentication**
```
POST   /api/auth/supplier/login
POST   /api/auth/internal/login
```

### **Appointments** (protégé)
```
GET    /api/appointments
POST   /api/appointments
PATCH  /api/appointments/:id/status
PATCH  /api/appointments/:id/reschedule
```

### **Suppliers** (protégé)
```
GET    /api/suppliers
GET    /api/suppliers/:id
```

### **Locations** (protégé)
```
GET    /api/locations
GET    /api/locations/:id/appointments?startDate=...&endDate=...
```

### **Admin** (protégé - ADMIN only)
```
POST   /api/admin/suppliers
POST   /api/admin/users
POST   /api/admin/locations
DELETE /api/admin/locations/:id
POST   /api/admin/quays
POST   /api/admin/quay-assignments
```

---

## 🛠️ Commandes Utiles

### **Backend**
```bash
npm run dev              # Développement avec hot-reload
npm run build           # Compilation TypeScript
npm run start           # Production
npm run prisma:migrate  # Créer migrations
npm run prisma:generate # Générer client Prisma
npm test               # Tests (à configurer)
```

### **Frontend**
```bash
npm run dev             # Développement
npm run build          # Build production
npm run preview        # Preview build
npm run lint           # Linting
```

---

## 🐛 Dépannage

### **"Cannot find module '@prisma/client'"**
```bash
cd backend
npm run prisma:generate
```

### **Erreur de connexion à PostgreSQL**
```bash
# Vérifier que PostgreSQL tourne
psql -U postgres

# Vérifier DATABASE_URL dans .env
echo $DATABASE_URL
```

### **Port 5000 / 3000 déjà utilisé**
```bash
# Changer dans backend/.env et frontend/vite.config.ts
PORT=5001
```

### **JWT Token Invalid**
- Vérifier que `JWT_SECRET` est identique sur le serveur
- Vérifier que le token n'est pas expiré (7 jours par défaut)

---

## 📦 Dépendances Principales

| Package | Utilisation |
|---------|-------------|
| **express** | Framework backend |
| **@prisma/client** | ORM database |
| **jsonwebtoken** | Authentification JWT |
| **bcryptjs** | Hash mots de passe |
| **nodemailer** | Envoi emails |
| **react** | Frontend UI |
| **react-router-dom** | Navigation |
| **zustand** | État global |
| **axios** | Requêtes HTTP |
| **tailwindcss** | Styling CSS |

---

## 📋 Prochaines Étapes

- [ ] ✅ Setup backend & database
- [ ] ✅ Setup frontend
- [ ] Créer interface de prise de rendez-vous (Supplier)
- [ ] Implémenter calendrier logistique (Employee)
- [ ] Compléter dashboard admin
- [ ] Intégrer envois email
- [ ] Ajouter tests
- [ ] Déployer sur GitHub
- [ ] Configurer CI/CD
- [ ] Mettre en production

---

## 🚢 Déploiement

### **Backend** (Railway / Heroku)
1. Créer compte & lier repository GitHub
2. Ajouter variables d'environnement (DATABASE_URL, JWT_SECRET, etc.)
3. Déployer automatiquement à chaque push

### **Frontend** (Vercel / Netlify)
1. Importer repository
2. Build: `npm run build`
3. Output: `dist/`

---

## 📞 Support

- 📚 Documentation: [README.md](./README.md)
- 🐛 Issues: Créer une issue GitHub
- 💬 Questions: Contacter l'équipe

---

**Bon développement! 🎉**
