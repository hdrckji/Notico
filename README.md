# Supplier Delivery Appointment Management System

## 📋 Project Overview

Système de gestion complète des rendez-vous de livraison fournisseurs avec trois interfaces distinctes:

### **1. Interface Fournisseur** 👷
- ✅ Login avec email/mot de passe
- ✅ Prise de rendez-vous (numéro de commande + volume)
- ✅ Sélection du type de livraison (palette/colis)
- ✅ Modification de la date du rendez-vous
- ✅ Historique des rendez-vous

### **2. Interface Logistique** 📅
- ✅ Vue calendrier par site de livraison
- ✅ Vue calendrier par quai
- ✅ Validation des livraisons (✓ Livré)
- ✅ Gestion des livraisons non honorées
- ✅ Enregistrement des livraisons non planifiées
- ✅ Notifications automatiques aux fournisseurs

### **3. Interface Admin** ⚙️
- ✅ Gestion des fournisseurs (création, édition, suppression)
- ✅ Gestion des lieux de livraison
- ✅ Gestion des quais par lieu
- ✅ Attribution des quais aux fournisseurs
- ✅ Création des utilisateurs internes
- ✅ Définition des volumes max par jour
- ✅ Gestion des rendez-vous

---

## 🛠️ Stack Technologique

### **Backend**
- **Runtime**: Node.js (v18+)
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Auth**: JWT (JSON Web Tokens)
- **Email**: NodeMailer

### **Frontend**
- **Framework**: React 18
- **Language**: TypeScript
- **Router**: React Router v6
- **State**: Zustand
- **Styling**: Tailwind CSS
- **Calendar**: React Big Calendar
- **Build**: Vite

---

## 📁 Structure du Projet

```
Notico/
├── .github/
│   └── copilot-instructions.md
├── backend/
│   ├── src/
│   │   ├── server.ts
│   │   ├── config/
│   │   │   ├── database.ts
│   │   │   ├── jwt.ts
│   │   │   └── email.ts
│   │   ├── middleware/
│   │   │   └── auth.ts
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── suppliers.ts
│   │   │   ├── appointments.ts
│   │   │   ├── locations.ts
│   │   │   └── admin.ts
│   │   ├── controllers/
│   │   ├── services/
│   │   └── models/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── SupplierLogin.tsx
│   │   │   ├── SupplierDashboard.tsx
│   │   │   ├── EmployeeDashboard.tsx
│   │   │   ├── AdminDashboard.tsx
│   │   │   └── NotFound.tsx
│   │   ├── store/
│   │   │   └── authStore.ts
│   │   ├── services/
│   │   │   └── api.ts
│   │   ├── index.css
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── postcss.config.js
└── README.md
```

---

## 🚀 Installation & Lancement

### **Prérequis**
- Node.js v18+
- PostgreSQL (local ou cloud)
- Git

### **1️⃣ Cloner le repository**
```bash
git clone https://github.com/your-username/Notico.git
cd Notico
```

### **2️⃣ Setup Backend**
```bash
cd backend
npm install
cp .env.example .env
# Éditer .env avec vos paramètres (DB, JWT, Email)
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Le backend démarre sur `http://localhost:5000`

### **3️⃣ Setup Frontend**
```bash
cd ../frontend
npm install
npm run dev
```

Le frontend démarre sur `http://localhost:3000`

### **4️⃣ Accès aux interfaces**
- **Fournisseur**: http://localhost:3000/supplier/login
- **Logistique**: http://localhost:3000/employee (après login)
- **Admin**: http://localhost:3000/admin (après login)

---

## 📊 Modèle de Données (Prisma)

### **Enums**
- `UserRole`: ADMIN, EMPLOYEE, SUPPLIER
- `AppointmentStatus`: SCHEDULED, DELIVERED, RESCHEDULED, NO_SHOW, CANCELLED
- `DeliveryType`: PALLET, PARCEL

### **Tables Principales**
- `Supplier`: Fournisseurs avec contacts et volumes max
- `InternalUser`: Employés et admins
- `DeliveryLocation`: Lieux de livraison (sites)
- `Quay`: Quais par lieu
- `QuayAssignment`: Attribution des quais aux fournisseurs
- `Appointment`: Rendez-vous de livraison

---

## 🔐 Authentification

Le système utilise **JWT** avec deux endpoints:
- `POST /api/auth/supplier/login` - Pour les fournisseurs
- `POST /api/auth/internal/login` - Pour les employés/admins

**Headers requis**:
```bash
Authorization: Bearer <token>
```

---

## 📧 Service Email

Notifications automatiques via NodeMailer:
- ✅ Confirmation de rendez-vous
- ✅ Demande de reprise (NO_SHOW)
- ✅ Confirmation de livraison

Configuration dans `.env`:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@supplier-appointments.com
```

---

## 🌐 Endpoints API

### **Authentication**
- `POST /api/auth/supplier/login`
- `POST /api/auth/internal/login`

### **Appointments**
- `GET /api/appointments` - Lister les rendez-vous
- `POST /api/appointments` - Créer un rendez-vous
- `PATCH /api/appointments/:id/status` - Marquer comme livré
- `PATCH /api/appointments/:id/reschedule` - Reprogrammer

### **Suppliers**
- `GET /api/suppliers` - Lister les fournisseurs
- `GET /api/suppliers/:id` - Détails fournisseur

### **Locations**
- `GET /api/locations` - Lister les lieux
- `GET /api/locations/:id/appointments` - Rendez-vous par lieu

### **Admin**
- `POST /api/admin/suppliers` - Créer fournisseur
- `POST /api/admin/users` - Créer utilisateur interne
- `POST /api/admin/locations` - Créer lieu
- `DELETE /api/admin/locations/:id` - Supprimer lieu
- `POST /api/admin/quays` - Créer quai
- `POST /api/admin/quay-assignments` - Attribuer quai

---

## 🧪 Tests

```bash
# Backend tests
cd backend
npm run test

# Frontend tests (à configurer)
cd frontend
npm run test
```

---

## 📝 Variables d'Environnement

### **Backend (.env)**
```env
DATABASE_URL=postgresql://user:password@localhost:5432/supplier_appointments
JWT_SECRET=your-super-secret-key
JWT_EXPIRY=7d
PORT=5000
NODE_ENV=development
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=email@gmail.com
SMTP_PASS=app-password
SMTP_FROM=noreply@supplier-appointments.com
FRONTEND_URL=http://localhost:3000
```

### **Frontend (.env.local)** (si besoin)
```env
VITE_API_URL=http://localhost:5000/api
```

---

## 📦 Déploiement

### **Backend (Heroku/Railway)**
1. Créer un projet
2. Connecter le repository GitHub
3. Ajouter variables d'environnement
4. Deployer via push GitHub

### **Frontend (Vercel/Netlify)**
1. Importer le projet
2. Build command: `npm run build`
3. Output directory: `dist`
4. Deployer

---

## 🐛 Troubleshooting

### Database Connection
```bash
# Vérifier la connexion PostgreSQL
psql -U user -d supplier_appointments
```

### JWT Errors
- Vérifier que `JWT_SECRET` est défini dans `.env`
- Vérifier le format du token

### Email Not Sending
- Activer les apps moins sécurisées (Gmail)
- Utiliser mot de passe d'app spécifique
- Vérifier les credentials dans `.env`

---

## 📄 License

MIT © 2024

---

## 👨‍💻 Support

Pour des questions ou problèmes, créer une issue sur GitHub.

---

## ✅ Checklist de Completion

- [x] Architecture fullstack définie
- [x] Base de données Prisma
- [x] Authentification JWT
- [x] Routes API complètes
- [x] Frontend React scaffolding
- [ ] Interface fournisseur (formulaires)
- [ ] Calendrier logistique
- [ ] Dashboard admin complet
- [ ] Tests unitaires
- [ ] Documentation API (Swagger)
- [ ] CI/CD pipeline
- [ ] Déploiement production
