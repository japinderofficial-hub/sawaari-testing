# SAWAARI - Auto Rickshaw Booking Platform (Monorepo)

Welcome to **SAWAARI**, a premium mobility platform designed exclusively for Auto Rickshaws.

---

## Repository Structure

This is an `npm workspaces` monorepo containing:
* `sawaari-frontend/`: Next.js Web App (Tailwind CSS, Leaflet Maps, Socket.IO Client).
* `sawaari-backend/`: NestJS Backend API (PostgreSQL + PostGIS, Redis Cache, Sockets.IO Server).

---

## Quick Start Setup (VS Code)

Follow these steps to run the application locally on your machine:

### 1. Prerequisite Containers (Database & Redis)
Ensure Docker is installed and running, then start the database and cache services using:
```bash
docker compose up -d
```
* **PostgreSQL (PostGIS)** runs on port `5435`.
* **Redis** runs on port `6380`.

---

### 2. Environment Configuration
Create the environment files from the provided templates.

#### Backend
Navigate to `sawaari-backend/` and copy `.env.example` to `.env`:
```bash
cp sawaari-backend/.env.example sawaari-backend/.env
```

#### Frontend
Navigate to `sawaari-frontend/` and copy `.env.example` to `.env.local`:
```bash
cp sawaari-frontend/.env.example sawaari-frontend/.env.local
```

---

### 3. Install Dependencies
Run npm install from the root directory to install all packages for both the backend and frontend:
```bash
npm install
```

---

### 4. Running the Development Servers

You can run both servers directly from the root using monorepo workspace scripts:

#### Start Backend
```bash
npm run dev:backend
```
The NestJS server will start on [http://localhost:3001/api](http://localhost:3001/api).

#### Start Frontend
```bash
npm run dev:frontend
```
The Next.js application will start on [http://localhost:3000](http://localhost:3000).

---

## Features Implemented
* **Real-time Ride Offer Overlay**: Centered, dimmed overlay backdrop (`z-[9998]`/`z-[9999]`) resolving Leaflet map layering issues. Displays Pickup/Destination address, Estimated Earning, Distance, Travel Time (ETA), and Countdown timer.
* **Auto Driver Activation Bypass**: In dev/bypass mode, mock drivers (UID starting with `uid-`) automatically activate to `active` and have all 5 documents approved upon profile load, avoiding approval blocks.
* **Socket and GPS sync**: Geolocation watch positioning and immediate broadcasting synchronized with socket status. Allows manual map click simulation.
* **End-to-End Simulation**: Built-in verification testing in `/testing` page.
