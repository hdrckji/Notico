<!-- Use this file to provide workspace-specific custom instructions to Copilot -->

# Supplier Delivery Appointment Management System

## Project Overview
Système de gestion des rendez-vous de livraison fournisseurs avec trois interfaces:
- **Fournisseurs**: Prise de rendez-vous via login (numéro de commande + volume)
- **Logistique**: Vue calendrier par site/quai, validation des livraisons
- **Admin**: Gestion complète (fournisseurs, employés, lieux, quais, volumes max)

## Architecture
- **Backend**: Node.js + Express + PostgreSQL + JWT
- **Frontend**: React + TypeScript + React Router + Tailwind CSS
- **Database**: PostgreSQL (Prisma ORM)

## Key Features
1. Multi-role authentication (supplier, employee, admin)
2. Appointment booking with delivery location auto-determination
3. Calendar views per site
4. Email notifications for rescheduling
5. Dynamic quay assignment

## Development Guidelines
- Use Prisma for database operations
- Implement JWT for authentication
- Create reusable components in React
- Use environment variables for config
- Email service via NodeMailer

## Completion Status
- [ ] Backend setup and dependencies
- [ ] Database schema and migrations
- [ ] Authentication and middleware
- [ ] API endpoints (suppliers, appointments, admin)
- [ ] Frontend scaffolding
- [ ] Component development
- [ ] Email service integration
- [ ] Testing and deployment
